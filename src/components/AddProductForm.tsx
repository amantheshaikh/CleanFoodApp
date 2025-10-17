import { useState, useRef } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Checkbox } from './ui/checkbox';
import { Alert, AlertDescription } from './ui/alert';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { 
  Upload, 
  Camera, 
  Info, 
  CheckCircle, 
  AlertTriangle, 
  Loader2,
  ExternalLink,
  Plus,
  X
} from 'lucide-react';
import { projectId, publicAnonKey } from '../utils/supabase/info';
import { toast } from 'sonner@2.0.3';

interface AddProductFormProps {
  barcode: string;
  onSuccess: (productUrl: string) => void;
  onCancel: () => void;
}

interface ProductImages {
  front?: File;
  ingredients?: File;
  nutrition?: File;
}

export function AddProductForm({ barcode, onSuccess, onCancel }: AddProductFormProps) {
  const [productName, setProductName] = useState('');
  const [brands, setBrands] = useState('');
  const [quantity, setQuantity] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState('');
  const [ingredientsText, setIngredientsText] = useState('');
  const [language, setLanguage] = useState('en');
  const [images, setImages] = useState<ProductImages>({});
  const [agreedToLicense, setAgreedToLicense] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [productUrl, setProductUrl] = useState<string | null>(null);

  const frontImageRef = useRef<HTMLInputElement>(null);
  const ingredientsImageRef = useRef<HTMLInputElement>(null);
  const nutritionImageRef = useRef<HTMLInputElement>(null);

  const commonCategories = [
    'Food',
    'Beverages',
    'Snacks',
    'Dairy products',
    'Meat',
    'Fish',
    'Fruits',
    'Vegetables',
    'Cereals and potatoes',
    'Bread',
    'Sweets',
    'Condiments',
    'Prepared meals',
    'Baby food',
    'Frozen foods',
    'Canned foods'
  ];

  const languages = [
    { code: 'en', name: 'English' },
    { code: 'fr', name: 'French' },
    { code: 'es', name: 'Spanish' },
    { code: 'de', name: 'German' },
    { code: 'it', name: 'Italian' },
    { code: 'pt', name: 'Portuguese' },
    { code: 'nl', name: 'Dutch' },
    { code: 'pl', name: 'Polish' },
    { code: 'ru', name: 'Russian' },
    { code: 'ja', name: 'Japanese' },
    { code: 'zh', name: 'Chinese' }
  ];

  const handleImageUpload = (imageType: 'front' | 'ingredients' | 'nutrition') => (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select a valid image file.');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image file is too large. Please select an image smaller than 10MB.');
      return;
    }

    setImages(prev => ({
      ...prev,
      [imageType]: file
    }));

    // Clear the input so the same file can be selected again
    event.target.value = '';
  };

  const removeImage = (imageType: 'front' | 'ingredients' | 'nutrition') => {
    setImages(prev => {
      const newImages = { ...prev };
      delete newImages[imageType];
      return newImages;
    });
  };

  const addCategory = () => {
    if (newCategory.trim() && !categories.includes(newCategory.trim())) {
      setCategories(prev => [...prev, newCategory.trim()]);
      setNewCategory('');
    }
  };

  const removeCategory = (category: string) => {
    setCategories(prev => prev.filter(c => c !== category));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!agreedToLicense) {
      setSubmitError('Please agree to the Creative Commons license to submit photos.');
      return;
    }

    if (!productName.trim()) {
      setSubmitError('Product name is required.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Submit product information
      const formData = new FormData();
      formData.append('barcode', barcode);
      formData.append('product_name', productName.trim());
      formData.append('brands', brands.trim());
      formData.append('quantity', quantity.trim());
      formData.append('categories', categories.join(', '));
      formData.append('ingredients_text', ingredientsText.trim());
      formData.append('lc', language);

      console.log('Submitting product data to backend...');
      
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-5111eaf7/product/submit`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`
        },
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to submit product');
      }

      const result = await response.json();
      console.log('Product submitted successfully:', result);

      // Upload images if provided
      const imageUploads = [];
      for (const [imageType, file] of Object.entries(images)) {
        if (file) {
          const imageFormData = new FormData();
          imageFormData.append(`imgupload_${imageType}`, file);
          imageFormData.append('lc', language);

          console.log(`Uploading ${imageType} image...`);
          
          const imageResponse = fetch(`https://${projectId}.supabase.co/functions/v1/make-server-5111eaf7/product/${barcode}/image/${imageType}`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${publicAnonKey}`
            },
            body: imageFormData
          });

          imageUploads.push(imageResponse);
        }
      }

      // Wait for all image uploads to complete
      if (imageUploads.length > 0) {
        console.log(`Uploading ${imageUploads.length} images...`);
        const imageResults = await Promise.allSettled(imageUploads);
        
        const failedUploads = imageResults.filter(result => result.status === 'rejected');
        if (failedUploads.length > 0) {
          console.warn('Some image uploads failed:', failedUploads);
        }
      }

      setSubmitSuccess(true);
      setProductUrl(result.product_url);
      
      // Call success callback after a brief delay to show success message
      setTimeout(() => {
        onSuccess(result.product_url);
      }, 2000);

    } catch (error: any) {
      console.error('Error submitting product:', error);
      setSubmitError(error.message || 'Failed to submit product. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitSuccess) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-6 w-6 text-green-600" />
            Product Added Successfully!
          </CardTitle>
          <CardDescription>
            Thank you for contributing to the OpenFoodFacts database!
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              Your product "{productName}" has been submitted to OpenFoodFacts and will be available shortly.
            </AlertDescription>
          </Alert>
          
          {productUrl && (
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => window.open(productUrl, '_blank')}
                className="flex items-center gap-2"
              >
                <ExternalLink className="h-4 w-4" />
                View on OpenFoodFacts
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plus className="h-6 w-6 text-blue-600" />
          Help Add This Product
        </CardTitle>
        <CardDescription>
          This product (barcode: {barcode}) isn't in the OpenFoodFacts database yet. 
          Help the community by adding it!
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {submitError && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{submitError}</AlertDescription>
            </Alert>
          )}

          {/* Basic Product Information */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="productName">Product Name *</Label>
              <Input
                id="productName"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="e.g., Organic Tomato Sauce"
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="brands">Brand(s)</Label>
                <Input
                  id="brands"
                  value={brands}
                  onChange={(e) => setBrands(e.target.value)}
                  placeholder="e.g., Heinz, Kraft"
                />
              </div>
              <div>
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  id="quantity"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="e.g., 500g, 12 fl oz"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="language">Primary Language</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {languages.map(lang => (
                    <SelectItem key={lang.code} value={lang.code}>
                      {lang.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          {/* Categories */}
          <div className="space-y-3">
            <Label>Categories</Label>
            <div className="flex flex-wrap gap-2">
              {categories.map(category => (
                <Badge key={category} variant="secondary" className="flex items-center gap-1">
                  {category}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-auto p-0 ml-1"
                    onClick={() => removeCategory(category)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Add category"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addCategory())}
              />
              <Button type="button" onClick={addCategory} size="sm">
                Add
              </Button>
            </div>
            <div className="text-sm text-muted-foreground">
              Common categories: {commonCategories.slice(0, 5).join(', ')}, ...
            </div>
          </div>

          <Separator />

          {/* Ingredients */}
          <div>
            <Label htmlFor="ingredients">Ingredients</Label>
            <Textarea
              id="ingredients"
              value={ingredientsText}
              onChange={(e) => setIngredientsText(e.target.value)}
              placeholder="List all ingredients as they appear on the package, separated by commas"
              rows={4}
            />
          </div>

          <Separator />

          {/* Image Uploads */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Label>Product Photos</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="h-4 w-4 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm" asChild>
                    <div>
                      Photos help verify product information. Take clear photos of:
                      • Front of package (with product name and brand)
                      • Ingredients list
                      • Nutrition facts (if available)
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Front Image */}
              <div className="space-y-2">
                <Label className="text-sm">Front Package</Label>
                {images.front ? (
                  <div className="relative">
                    <div className="bg-muted p-4 rounded-lg text-center">
                      <Camera className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm">Front image selected</p>
                      <p className="text-xs text-muted-foreground">{images.front.name}</p>
                    </div>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="absolute -top-2 -right-2"
                      onClick={() => removeImage('front')}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-24 flex flex-col items-center gap-2"
                    onClick={() => frontImageRef.current?.click()}
                  >
                    <Upload className="h-4 w-4" />
                    Upload Front
                  </Button>
                )}
                <input
                  ref={frontImageRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload('front')}
                  className="hidden"
                />
              </div>

              {/* Ingredients Image */}
              <div className="space-y-2">
                <Label className="text-sm">Ingredients List</Label>
                {images.ingredients ? (
                  <div className="relative">
                    <div className="bg-muted p-4 rounded-lg text-center">
                      <Camera className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm">Ingredients image selected</p>
                      <p className="text-xs text-muted-foreground">{images.ingredients.name}</p>
                    </div>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="absolute -top-2 -right-2"
                      onClick={() => removeImage('ingredients')}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-24 flex flex-col items-center gap-2"
                    onClick={() => ingredientsImageRef.current?.click()}
                  >
                    <Upload className="h-4 w-4" />
                    Upload Ingredients
                  </Button>
                )}
                <input
                  ref={ingredientsImageRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload('ingredients')}
                  className="hidden"
                />
              </div>

              {/* Nutrition Image */}
              <div className="space-y-2">
                <Label className="text-sm">Nutrition Facts</Label>
                {images.nutrition ? (
                  <div className="relative">
                    <div className="bg-muted p-4 rounded-lg text-center">
                      <Camera className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm">Nutrition image selected</p>
                      <p className="text-xs text-muted-foreground">{images.nutrition.name}</p>
                    </div>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="absolute -top-2 -right-2"
                      onClick={() => removeImage('nutrition')}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-24 flex flex-col items-center gap-2"
                    onClick={() => nutritionImageRef.current?.click()}
                  >
                    <Upload className="h-4 w-4" />
                    Upload Nutrition
                  </Button>
                )}
                <input
                  ref={nutritionImageRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload('nutrition')}
                  className="hidden"
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* License Agreement */}
          <div className="space-y-3">
            <div className="flex items-start space-x-2">
              <Checkbox
                id="license"
                checked={agreedToLicense}
                onCheckedChange={(checked) => setAgreedToLicense(checked as boolean)}
              />
              <div className="space-y-1">
                <Label htmlFor="license" className="text-sm">
                  I took these photos and agree to publish them under{' '}
                  <a 
                    href="https://creativecommons.org/licenses/by-sa/3.0/" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    CC BY-SA 3.0 license
                  </a>
                </Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-xs text-muted-foreground cursor-help text-left block">
                        ⓘ What does this mean?
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-sm" asChild>
                      <div className="space-y-2">
                        <div>The Creative Commons BY-SA license means:</div>
                        <ul className="list-disc list-inside space-y-1 text-xs">
                          <li>Others can use and modify your photos</li>
                          <li>They must give you credit</li>
                          <li>They must share under the same license</li>
                          <li>This helps keep OpenFoodFacts free and open</li>
                        </ul>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
          </div>

          {/* Submit Buttons */}
          <div className="flex gap-3 pt-4">
            <Button
              type="submit"
              disabled={isSubmitting || !agreedToLicense}
              className="flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Add Product
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
