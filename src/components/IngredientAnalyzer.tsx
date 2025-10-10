import { useState, useRef, useEffect, useMemo } from 'react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { CheckCircle, XCircle, AlertTriangle, Camera, Upload, Scan, Type, Loader2, Info, Plus, Leaf } from 'lucide-react';
import { supabase } from '../utils/supabase/client';
import { projectId, publicAnonKey } from '../utils/supabase/info';
import { AddProductForm } from './AddProductForm';
import { findAvoidGuideMatch, type AvoidGuideMatch } from '../data/avoidList';
import { cn } from './ui/utils';

interface TaxonomyEntry {
  id?: string;
  display?: string;
  parents?: string[];
  synonyms?: string[];
  source?: string;
}

interface AnalysisResult {
  isClean: boolean;
  hits: string[];
  parsedIngredients: string[];
  canonical: string[];
  taxonomy: TaxonomyEntry[];
  source: string;
  html?: string;
  taxonomyError?: string | null;
  additivesError?: string | null;
  dietHits?: string[];
  dietPreference?: string | null;
  allergyHits?: string[];
  allergyPreferences?: string[];
}

interface FlaggedIngredientBadge {
  key: string;
  label: string;
  match: AvoidGuideMatch | null;
  original: string;
}

interface IngredientAnalyzerProps {
  accessToken?: string | null;
  onNavigateToGuide?: (payload: {
    section: AvoidGuideMatch['section'];
    slug: string;
    name: string;
  }) => void;
}

const dietLabels: Record<string, string> = {
  vegetarian: 'Vegetarian',
  vegan: 'Vegan',
  jain: 'Jain',
};

const getDietLabel = (value?: string | null): string | null => {
  if (!value || value === 'none') return null;
  return dietLabels[value] || value;
};

const formatIngredientLabel = (value: string): string => {
  if (!value) return value;
  const normalized = value.trim();
  if (!normalized.includes(' ') && normalized.length <= 5) {
    return normalized.toUpperCase();
  }
  return normalized
    .split(/\s+/)
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ');
};

export function IngredientAnalyzer({ accessToken, onNavigateToGuide }: IngredientAnalyzerProps) {
  const [ingredients, setIngredients] = useState('');
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState('barcode');
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraPermission, setCameraPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [ocrCameraStream, setOcrCameraStream] = useState<MediaStream | null>(null);
  const [isOcrCameraActive, setIsOcrCameraActive] = useState(false);
  const [ocrCameraError, setOcrCameraError] = useState<string | null>(null);
  const [showOcrCameraPrompt, setShowOcrCameraPrompt] = useState(false);
  const [showCameraPrompt, setShowCameraPrompt] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState<string | null>(null);
  const [showAddProductForm, setShowAddProductForm] = useState(false);
  const [productFound, setProductFound] = useState<any>(null);
  const [barcodeError, setBarcodeError] = useState<string | null>(null);
  const [isLoadingProduct, setIsLoadingProduct] = useState(false);
  const [barcodeDebug, setBarcodeDebug] = useState<string | null>(null);
  const [dietPreference, setDietPreference] = useState<'none' | 'vegetarian' | 'vegan' | 'jain'>('none');
  const [trackedAllergies, setTrackedAllergies] = useState<string[]>([]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ocrVideoRef = useRef<HTMLVideoElement>(null);
  const ocrCanvasRef = useRef<HTMLCanvasElement>(null);
  const quaggaContainerRef = useRef<HTMLDivElement>(null);
  const quaggaRef = useRef<any>(null);
  const quaggaOnDetectedRef = useRef<any>(null);
  const quaggaOnProcessedRef = useRef<any>(null);
  const barcodeDetectionAttemptsRef = useRef(0);
  const barcodeDetectedRef = useRef(false);

  // Cleanup camera streams on unmount
  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
      }
      if (ocrCameraStream) {
        ocrCameraStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [cameraStream, ocrCameraStream]);

  // OCR functionality using Tesseract.js
  const extractTextFromImage = async (imageFile: File): Promise<string> => {
    setIsProcessingImage(true);
    try {
      // Import Tesseract.js dynamically
      const Tesseract = await import('tesseract.js');
      
      const { data: { text } } = await Tesseract.recognize(imageFile, 'eng', {
        logger: (m: any) => {
          if (m.status === 'recognizing text') {
            console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
          }
        }
      });
      
      // Clean up the extracted text - remove extra whitespace and format
      const cleanedText = text
        .replace(/\s+/g, ' ')
        .replace(/[^\w\s,.-]/g, '')
        .trim();
      
      if (!cleanedText) {
        throw new Error('No text found in image. Please try a clearer image.');
      }
      
      return cleanedText;
    } catch (error: any) {
      console.error('OCR Error:', error);
      throw new Error(error.message || 'Failed to extract text from image');
    } finally {
      setIsProcessingImage(false);
    }
  };

  // Handle image file upload
  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select a valid image file.');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert('Image file is too large. Please select an image smaller than 10MB.');
      return;
    }

    try {
      const extractedText = await extractTextFromImage(file);
      setIngredients(extractedText);
      
      // Show success message
      console.log('Text extracted successfully:', extractedText);
    } catch (error: any) {
      console.error('Image processing error:', error);
      alert(`Failed to extract text from image: ${error.message}\n\nTips:\n- Ensure the image is clear and well-lit\n- Make sure the ingredient list is visible\n- Try a different image or use manual input`);
    }
    
    // Clear the input so the same file can be selected again
    event.target.value = '';
  };

  // Show OCR camera permission prompt
  const showOcrCameraPermissionPrompt = () => {
    setShowOcrCameraPrompt(true);
  };

  // Start camera for OCR
  const startOcrCamera = async () => {
    setOcrCameraError(null);
    setIsOcrCameraActive(true);
    setShowOcrCameraPrompt(false);
    
    try {
      // Check if camera is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera not supported on this device or browser. Please try uploading an image instead.');
      }

      // Check if we're on HTTPS (required for camera access)
      if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
        throw new Error('Camera access requires a secure connection (HTTPS). Please try uploading an image instead.');
      }

      const constraints = {
        video: {
          facingMode: 'environment', // Use back camera if available
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      };

      console.log('Requesting camera access for OCR...');
      
      // Directly request camera access - this will trigger permission prompt if needed
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setOcrCameraStream(stream);
      setCameraPermission('granted');
      
      if (ocrVideoRef.current) {
        ocrVideoRef.current.srcObject = stream;
        await ocrVideoRef.current.play();
      }
      
      console.log('OCR Camera access granted successfully');
    } catch (error: any) {
      console.error('OCR Camera access error:', error);
      setIsOcrCameraActive(false);
      
      let errorMessage = '';
      
      if (error.name === 'NotAllowedError') {
        setCameraPermission('denied');
        errorMessage = 'Camera access was denied. To use the camera feature:\n\n1. Click "Allow" when your browser asks for camera permission\n2. If you accidentally clicked "Block", click the camera icon in your address bar and select "Allow"\n3. You can also try refreshing the page and trying again\n\nAlternatively, you can upload an image instead.';
      } else if (error.name === 'NotFoundError') {
        errorMessage = 'No camera found on this device. Please try uploading an image instead.';
      } else if (error.name === 'NotSupportedError') {
        errorMessage = 'Camera not supported on this device or browser. Please try uploading an image instead.';
      } else if (error.name === 'NotReadableError') {
        errorMessage = 'Camera is already in use by another application. Please close other apps using the camera and try again.';
      } else {
        errorMessage = error.message || 'An unknown error occurred. Please try uploading an image instead.';
      }
      
      setOcrCameraError(errorMessage);
    }
  };

  // Stop OCR camera
  const stopOcrCamera = () => {
    if (ocrCameraStream) {
      ocrCameraStream.getTracks().forEach(track => track.stop());
      setOcrCameraStream(null);
    }
    setIsOcrCameraActive(false);
    setOcrCameraError(null);
  };

  // Capture image for OCR processing
  const captureForOcr = async () => {
    if (!ocrVideoRef.current || !ocrCanvasRef.current) return;

    const canvas = ocrCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = ocrVideoRef.current.videoWidth;
    canvas.height = ocrVideoRef.current.videoHeight;
    ctx.drawImage(ocrVideoRef.current, 0, 0);

    try {
      // Convert canvas to blob for OCR processing
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        
        // Create a File object from the blob for OCR processing
        const file = new File([blob], 'camera-capture.jpg', { type: 'image/jpeg' });
        
        try {
          const extractedText = await extractTextFromImage(file);
          setIngredients(extractedText);
          stopOcrCamera();
          
          console.log('Text extracted from camera capture:', extractedText);
        } catch (error: any) {
          console.error('OCR processing error:', error);
          alert(`Failed to extract text from captured image: ${error.message}\n\nTips:\n- Ensure the ingredient list is clearly visible\n- Hold the camera steady\n- Make sure there's good lighting\n- Try capturing again or use image upload`);
        }
      }, 'image/jpeg', 0.9);
    } catch (error) {
      console.error('Camera capture error:', error);
    }
  };

  // Check camera permission (passive check only)
  const checkCameraPermission = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        return false;
      }

      // Check if permissions API is available
      if ('permissions' in navigator) {
        const permission = await navigator.permissions.query({ name: 'camera' as PermissionName });
        setCameraPermission(permission.state);
        return permission.state === 'granted';
      }
      
      return true; // Assume it's available if permissions API not supported
    } catch (error) {
      console.error('Permission check error:', error);
      return true; // Try anyway if permission check fails
    }
  };

  // Show camera permission prompt for barcode scanning
  const showCameraPermissionPrompt = () => {
    setShowCameraPrompt(true);
  };

  // Start camera for barcode scanning
  const startCamera = async () => {
    setCameraError(null);
    setBarcodeError(null);
    setIsScanning(true);
    setShowCameraPrompt(false);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera not supported on this device or browser.');
      }
      if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
        throw new Error('Camera access requires a secure connection (HTTPS).');
      }

      const Quagga = await loadQuagga();
      setBarcodeDebug('Initializing barcode scanner...');

      barcodeDetectionAttemptsRef.current = 0;
      barcodeDetectedRef.current = false;

      const constraints = {
        facingMode: 'environment',
        width: { ideal: 1280 },
        height: { ideal: 720 },
      };

      Quagga.init(
        {
          inputStream: {
            type: 'LiveStream',
            target: quaggaContainerRef.current || undefined,
            constraints,
          },
          decoder: {
            readers: ['ean_reader', 'ean_8_reader', 'code_128_reader', 'upc_reader', 'upc_e_reader'],
          },
          locate: true,
        },
        (err: any) => {
          if (err) {
            console.error('Quagga initialization error:', err);
            setIsScanning(false);
            setBarcodeError('Failed to start barcode scanner. ' + (err?.message || ''));
            setBarcodeDebug('Initialization error. See console.');
            return;
          }

          setBarcodeDebug('Scanning for barcode...');

          const onDetected = (data: any) => {
            const code = data?.codeResult?.code?.trim();
            if (!code || barcodeDetectedRef.current) {
              return;
            }
            console.log('Barcode detected via Quagga:', code);
            barcodeDetectedRef.current = true;
            setBarcodeDebug(`Detected barcode: ${code}`);
            stopCamera();
            fetchProductInfo(code);
          };

          const onProcessed = () => {
            if (barcodeDetectedRef.current) {
              return;
            }
            barcodeDetectionAttemptsRef.current += 1;
            if (barcodeDetectionAttemptsRef.current % 25 === 0) {
              setBarcodeDebug(
                `Scanning... ${barcodeDetectionAttemptsRef.current} frames with no match. Adjust distance, lighting, or angle.`
              );
            }
          };

          quaggaOnDetectedRef.current = onDetected;
          quaggaOnProcessedRef.current = onProcessed;

          Quagga.onDetected(onDetected);
          Quagga.onProcessed(onProcessed);
          Quagga.start();

          requestAnimationFrame(() => {
            const container = quaggaContainerRef.current;
            if (!container) return;
            const videoEl = container.querySelector('video') as HTMLVideoElement | null;
            const canvasEl = container.querySelector('canvas') as HTMLCanvasElement | null;
            if (videoEl) {
              videoEl.setAttribute('playsinline', 'true');
              videoEl.style.width = '100%';
              videoEl.style.height = '100%';
              videoEl.style.objectFit = 'cover';
              videoEl.style.position = 'absolute';
              videoEl.style.inset = '0';
            }
            if (canvasEl) {
              canvasEl.style.width = '100%';
              canvasEl.style.height = '100%';
              canvasEl.style.position = 'absolute';
              canvasEl.style.inset = '0';
            }
          });
        }
      );
    } catch (error: any) {
      console.error('Camera access error:', error);
      setIsScanning(false);

      let errorMessage = '';
      if (error.name === 'NotAllowedError') {
        setCameraPermission('denied');
        errorMessage =
          'Camera access was denied. To use the camera feature, click "Allow" when prompted or adjust your browser settings to enable the camera.';
      } else if (error.name === 'NotFoundError') {
        errorMessage = 'No camera found on this device.';
      } else if (error.name === 'NotSupportedError') {
        errorMessage = 'Camera not supported on this device or browser.';
      } else if (error.name === 'NotReadableError') {
        errorMessage =
          'Camera is already in use by another application. Please close other apps using the camera and try again.';
      } else {
        errorMessage = error.message || 'An unknown error occurred.';
      }

      setCameraError(errorMessage);
      setBarcodeDebug(null);
    }
  };;

  // Stop camera
  const stopCamera = () => {
    try {
      const Quagga = quaggaRef.current;
      if (Quagga && Quagga.stop) {
        if (quaggaOnDetectedRef.current) {
          Quagga.offDetected(quaggaOnDetectedRef.current);
          quaggaOnDetectedRef.current = null;
        }
        if (quaggaOnProcessedRef.current) {
          Quagga.offProcessed(quaggaOnProcessedRef.current);
          quaggaOnProcessedRef.current = null;
        }
        Quagga.stop();
      }
    } catch (err) {
      console.debug('Error stopping Quagga:', err);
    }

    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setIsScanning(false);
    setCameraError(null);
    setBarcodeDebug(null);
    barcodeDetectionAttemptsRef.current = 0;
    barcodeDetectedRef.current = false;
  };

const loadQuagga = async () => {
  if (quaggaRef.current) {
    return quaggaRef.current;
  }
  const module = await import('https://cdn.skypack.dev/@ericblade/quagga2@1.2.6?min');
  quaggaRef.current = module.default || module;
  return quaggaRef.current;
};

  // Capture frame and attempt barcode scanning
  
;;

  const extractIngredientsFromProduct = (product: any): string | null => {
    const candidates = [
      product.ingredients_text_en,
      product.ingredients_text,
      product.ingredients_text_fr,
      product.ingredients_text_es,
    ];
    for (const value of candidates) {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    if (Array.isArray(product.ingredients)) {
      const parts = product.ingredients
        .map((item: any) => {
          if (typeof item === 'string') return item;
          if (item && typeof item.text === 'string') return item.text;
          return null;
        })
        .filter(Boolean);
      if (parts.length) {
        return parts.join(', ');
      }
    }
    return null;
  };

  // Fetch product information from Open Food Facts directly
  const fetchProductInfo = async (barcode: string) => {
    try {
      setIsLoadingProduct(true);
      setBarcodeError(null);
      setScannedBarcode(barcode);
      
      console.log(`Fetching product info for barcode: ${barcode}`);
      
      const fields = ['code', 'product_name', 'brands', 'quantity', 'ingredients_text', 'ingredients_text_en', 'ingredients', 'image_ingredients_url'];
      const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${fields.join(',')}`;
      const response = await fetch(url, { headers: { 'Accept': 'application/json' } });
      const data = await response.json();

      if (data.status !== 1 || !data.product) {
        console.warn('Product lookup failed', data);
        setProductFound(null);
        setShowAddProductForm(true);
        setBarcodeError('Product not found in Open Food Facts. Help add it!');
        setBarcodeDebug('Open Food Facts did not return a product for this barcode.');
        return;
      }

      const product = data.product;
      const productSummary = {
        name: product.product_name || 'Unnamed product',
        brand: product.brands || undefined,
        quantity: product.quantity || undefined,
        barcode: product.code || barcode,
      };

      setProductFound(productSummary);
      setBarcodeDebug(`Fetched product from Open Food Facts (${productSummary.name})`);

      const ingredientText = extractIngredientsFromProduct(product);

      if (ingredientText) {
        setIngredients(ingredientText);
        try {
          const analysisResult = await performAnalysis(ingredientText);
          setAnalysis(analysisResult);
          await saveAnalysis(ingredientText, analysisResult);
          setBarcodeDebug(prev => (prev ? prev + ' • Analysis complete.' : 'Analysis complete.'));
        } catch (analysisError) {
          console.error('Failed to analyze ingredients from Open Food Facts', analysisError);
          setBarcodeDebug('Retrieved ingredients but analysis failed. Check console for details.');
        }
      } else {
        setBarcodeError('Product found but no ingredients listed. You can help add the missing details.');
        setBarcodeDebug('Product had no ingredient text. Prompting manual contribution.');
        setShowAddProductForm(true);
      }
    } catch (error) {
      console.error('Error fetching product info:', error);
      setBarcodeError('Failed to fetch product information. Please try again or enter ingredients manually.');
    } finally {
      setIsLoadingProduct(false);
    }
  };

  // Handle successful product addition
  const handleProductAdded = (productUrl: string) => {
    setShowAddProductForm(false);
    setScannedBarcode(null);
    setBarcodeError(null);
    
    // Optionally refetch the product info to populate ingredients
    if (scannedBarcode) {
      setTimeout(() => {
        fetchProductInfo(scannedBarcode);
      }, 1000);
    }
  };

  // Handle canceling product addition
  const handleCancelAddProduct = () => {
    setShowAddProductForm(false);
    setScannedBarcode(null);
    setBarcodeError(null);
  };

  useEffect(() => {
    if (!accessToken) {
      setDietPreference('none');
      return;
    }

    let active = true;
    const controller = new AbortController();

    const fetchPreferences = async () => {
      try {
        const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-5111eaf7/preferences`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        });
        if (!response.ok) return;
        const data = await response.json();
        if (!active) return;
        const pref = data?.preferences?.dietary_preference;
        if (typeof pref === 'string' && ['none', 'vegetarian', 'vegan', 'jain'].includes(pref)) {
          setDietPreference(pref as 'none' | 'vegetarian' | 'vegan' | 'jain');
        }
        const allergiesPayload = data?.preferences?.allergies;
        if (Array.isArray(allergiesPayload)) {
          const normalized = allergiesPayload
            .filter((entry: unknown): entry is string => typeof entry === 'string' && entry.trim().length > 0);
          setTrackedAllergies(normalized);
        } else {
          setTrackedAllergies([]);
        }
      } catch (err) {
        if ((err as any)?.name === 'AbortError') return;
        console.debug('Unable to load user preferences', err);
      }
    };

    fetchPreferences();

    return () => {
      active = false;
      controller.abort();
    };
  }, [accessToken]);

  const performAnalysis = async (text: string): Promise<AnalysisResult> => {
    const params = new URLSearchParams();
    params.set('ingredients', text);
    const preferencePayload: Record<string, unknown> = {};
    if (dietPreference && dietPreference !== 'none') {
      preferencePayload.diet = dietPreference;
    }
    if (trackedAllergies.length > 0) {
      const cleanedAllergies = Array.from(
        new Set(
          trackedAllergies
            .map((entry) => entry?.toString().trim())
            .filter((entry): entry is string => Boolean(entry))
        )
      );
      if (cleanedAllergies.length > 0) {
        preferencePayload.allergies = cleanedAllergies;
      }
    }
    if (Object.keys(preferencePayload).length > 0) {
      params.set('preferences', JSON.stringify(preferencePayload));
    }

    const apiBaseRaw = import.meta.env.VITE_API_BASE as string | undefined;
    const normalizedBase = apiBaseRaw ? apiBaseRaw.trim().replace(/\/?$/, '') : '';
    const endpoint = normalizedBase ? `${normalizedBase}/check` : '/check';

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'Accept': 'application/json',
        'X-Requested-With': 'fetch',
      },
      body: params.toString(),
    });

    const textPayload = await response.text();
    if (!response.ok) {
      let message = 'Analysis failed';
      try {
        const err = textPayload ? JSON.parse(textPayload) : {};
        if (err && err.error) message = err.error;
      } catch (err) {
        console.error('Failed to parse error payload', err);
      }
      throw new Error(message);
    }

    const data = textPayload ? JSON.parse(textPayload) : {};
    const apiAnalysis = data.analysis || {};

    const hits = Array.from(new Set([...(apiAnalysis.hits ?? []), ...(data.hits ?? [])]));
    const taxonomyEntries: TaxonomyEntry[] = (apiAnalysis.taxonomy ?? []).filter(Boolean);
    const dietHits = Array.isArray(apiAnalysis.diet_hits) ? apiAnalysis.diet_hits : Array.isArray(data.diet_hits) ? data.diet_hits : [];
    const dietPref = apiAnalysis.diet_preference ?? data.diet_preference ?? null;
    const allergyHits = Array.isArray(apiAnalysis.allergy_hits)
      ? apiAnalysis.allergy_hits
      : Array.isArray(data.allergy_hits)
        ? data.allergy_hits
        : [];
    const allergyPrefs = Array.isArray(apiAnalysis.allergy_preferences)
      ? apiAnalysis.allergy_preferences
      : Array.isArray(data.allergy_preferences)
        ? data.allergy_preferences
        : [];

    return {
      isClean: Boolean(data.is_clean ?? apiAnalysis.is_clean ?? false),
      hits,
      parsedIngredients: apiAnalysis.ingredients ?? [],
      canonical: apiAnalysis.canonical ?? [],
      taxonomy: taxonomyEntries,
      source: apiAnalysis.source ?? 'unknown',
      html: data.html,
      taxonomyError: apiAnalysis.taxonomy_error ?? data.taxonomy_error ?? null,
      additivesError: apiAnalysis.additives_error ?? data.additives_error ?? null,
      dietHits,
      dietPreference: dietPref,
      allergyHits,
      allergyPreferences: allergyPrefs,
    };
  };

  const saveAnalysis = async (text: string, analysisResult: AnalysisResult) => {
    try {
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-5111eaf7/analysis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken || publicAnonKey}`,
        },
        body: JSON.stringify({
          ingredients: text,
          analysis: analysisResult,
        }),
      });

      if (!response.ok) {
        console.error('Failed to save analysis');
      }
    } catch (error) {
      console.error('Error saving analysis:', error);
    }
  };

  const analyzeIngredients = async () => {
    if (!ingredients.trim()) {
      alert('Please enter some ingredients to analyze.');
      return;
    }

    setIsAnalyzing(true);

    try {
      const analysisResult = await performAnalysis(ingredients);
      setAnalysis(analysisResult);
      await saveAnalysis(ingredients, analysisResult);
    } catch (error: any) {
      console.error('Analysis error:', error);
      alert(error.message || 'Failed to analyze ingredients. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const flaggedMatches = useMemo<FlaggedIngredientBadge[]>(() => {
    if (!analysis?.hits?.length) {
      return [];
    }

    return analysis.hits.map((hit) => {
      const match = findAvoidGuideMatch(hit);
      return {
        key: match?.item.slug ?? hit,
        label: match?.item.name ?? formatIngredientLabel(hit),
        match,
        original: hit,
      };
    });
  }, [analysis]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Ingredient Analysis</CardTitle>
          <CardDescription>
            Choose how you'd like to input your food's ingredient list
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={(value) => {
            setActiveTab(value);
            // Reset barcode-specific state when switching tabs
            if (value !== 'barcode') {
              setShowAddProductForm(false);
              setScannedBarcode(null);
              setBarcodeError(null);
              setProductFound(null);
            }
          }} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="barcode" className="flex items-center gap-2">
                <Scan className="h-4 w-4" />
                Scan Barcode
              </TabsTrigger>
              <TabsTrigger value="ocr" className="flex items-center gap-2">
                <Camera className="h-4 w-4" />
                Scan Ingredients
              </TabsTrigger>
              <TabsTrigger value="text" className="flex items-center gap-2">
                <Type className="h-4 w-4" />
                Type Ingredients
              </TabsTrigger>
            </TabsList>

            <TabsContent value="barcode" className="space-y-4 mt-6">
              {showAddProductForm && scannedBarcode ? (
                <AddProductForm
                  barcode={scannedBarcode}
                  onSuccess={handleProductAdded}
                  onCancel={handleCancelAddProduct}
                />
              ) : (
                <div className="text-center space-y-4">
                  <div>
                    <p className="text-muted-foreground mb-2">
                      Scan a product barcode to automatically fetch ingredient information
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Uses the OpenFoodFacts database - help improve it by adding missing products!
                    </p>
                  </div>
                  
                  {barcodeError && (
                    <Alert variant={showAddProductForm ? "default" : "destructive"}>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        {barcodeError}
                      </AlertDescription>
                    </Alert>
                  )}

                  {barcodeDebug && (
                    <div className="text-xs text-muted-foreground bg-muted/40 rounded px-3 py-2">
                      {barcodeDebug}
                    </div>
                  )}

                  {cameraError && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription asChild>
                        <div className="space-y-3">
                          <div className="whitespace-pre-line">
                            {cameraError}
                          </div>
                          {cameraPermission === 'denied' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={showCameraPermissionPrompt}
                              className="w-full"
                            >
                              Try Camera Again
                            </Button>
                          )}
                        </div>
                      </AlertDescription>
                    </Alert>
                  )}

                  {productFound && (
                    <Alert>
                      <CheckCircle className="h-4 w-4" />
                      <AlertDescription asChild>
                        <div className="text-left">
                          <div><strong>Product Found:</strong> {productFound.name}</div>
                          {productFound.brand && <div><strong>Brand:</strong> {productFound.brand}</div>}
                          {productFound.quantity && <div><strong>Quantity:</strong> {productFound.quantity}</div>}
                          <div className="text-xs text-muted-foreground mt-1">
                            Barcode: {productFound.barcode}
                          </div>
                        </div>
                      </AlertDescription>
                    </Alert>
                  )}
                  
                  {!isScanning ? (
                    <div className="space-y-3 text-center">
                      <Button
                        onClick={showCameraPermissionPrompt}
                        disabled={isLoadingProduct}
                        className="mx-auto flex items-center gap-2"
                      >
                        <Camera className="h-4 w-4" />
                        Start Camera
                      </Button>
                      {!navigator.mediaDevices && (
                        <p className="text-sm text-muted-foreground">
                          Camera not supported on this device or browser
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="relative max-w-md mx-auto h-64 bg-black/80 rounded-lg border overflow-hidden shadow-inner">
                        <div ref={quaggaContainerRef} className="absolute inset-0" />
                        <div className="absolute inset-0 pointer-events-none">
                          <div className="h-full flex items-center justify-center">
                            <div className="border-2 border-white border-dashed rounded-lg w-48 h-32 flex items-center justify-center">
                              <span className="text-white text-sm bg-black bg-opacity-50 px-2 py-1 rounded text-center">
                                Position barcode here
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex gap-3 justify-center">
                        <Button
                          variant="outline"
                          onClick={stopCamera}
                          disabled={isLoadingProduct}
                        >
                          Stop Camera
                        </Button>
                      </div>
                      
                      <p className="text-sm text-muted-foreground">
                        Point your camera at a product barcode and click "Scan Barcode"
                      </p>
                    </div>
                  )}
                  
                  {ingredients && activeTab === 'barcode' && !showAddProductForm && (
                    <div className="mt-4 text-left">
                      <label className="block mb-2">Product Ingredients:</label>
                      <Textarea
                        value={ingredients}
                        onChange={(e) => setIngredients(e.target.value)}
                        rows={4}
                        className="w-full"
                        placeholder="Ingredients will appear here after scanning..."
                      />
                      <p className="text-sm text-muted-foreground mt-1">
                        You can edit the ingredients if needed before analysis
                      </p>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="ocr" className="space-y-4 mt-6">
              <div className="text-center space-y-4">
                <div>
                  <p className="text-muted-foreground mb-2">
                    Capture or upload a photo of the ingredient list or nutrition label
                  </p>
                  <p className="text-sm text-muted-foreground">
                    For best results, ensure the image is clear, well-lit, and the text is readable
                  </p>
                </div>
                
                {ocrCameraError && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription asChild>
                      <div className="space-y-3">
                        <div className="whitespace-pre-line">
                          {ocrCameraError}
                        </div>
                        {cameraPermission === 'denied' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={showOcrCameraPermissionPrompt}
                            className="w-full"
                          >
                            Try Camera Again
                          </Button>
                        )}
                      </div>
                    </AlertDescription>
                  </Alert>
                )}
                
                {!isOcrCameraActive ? (
                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <Button
                      variant="outline"
                      onClick={showOcrCameraPermissionPrompt}
                      disabled={isProcessingImage}
                      className="flex items-center gap-2"
                    >
                      <Camera className="h-4 w-4" />
                      Take Photo
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isProcessingImage}
                      className="flex items-center gap-2"
                    >
                      <Upload className="h-4 w-4" />
                      Upload Image
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="relative max-w-md mx-auto">
                      <video
                        ref={ocrVideoRef}
                        className="w-full rounded-lg border"
                        autoPlay
                        playsInline
                        muted
                      />
                      <canvas ref={ocrCanvasRef} className="hidden" />
                      
                      {/* Camera overlay guide */}
                      <div className="absolute inset-0 pointer-events-none">
                        <div className="h-full flex items-center justify-center">
                          <div className="border-2 border-white border-dashed rounded-lg w-56 h-40 flex items-center justify-center">
                            <span className="text-white text-sm bg-black bg-opacity-50 px-2 py-1 rounded text-center">
                              Position ingredient list here
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex gap-3 justify-center">
                      <Button
                        onClick={captureForOcr}
                        disabled={isProcessingImage}
                        className="flex items-center gap-2"
                      >
                        <Camera className="h-4 w-4" />
                        Capture & Process
                      </Button>
                      <Button
                        variant="outline"
                        onClick={stopOcrCamera}
                        disabled={isProcessingImage}
                      >
                        Cancel
                      </Button>
                    </div>
                    
                    <p className="text-sm text-muted-foreground">
                      Position the ingredient list within the frame and click "Capture & Process"
                    </p>
                  </div>
                )}
                
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageUpload}
                  accept="image/*"
                  className="hidden"
                />
                
                {isProcessingImage && (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <p>Processing image with OCR...</p>
                    <p className="text-sm">This may take a few seconds</p>
                  </div>
                )}
                
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>• Supported formats: JPG, PNG, GIF, WebP</p>
                  <p>• Maximum file size: 10MB</p>
                  <p>• Works best with high-contrast text</p>
                  <p>• Hold camera steady for best results</p>
                </div>
                
                {ingredients && activeTab === 'ocr' && (
                  <div className="mt-4 text-left">
                    <label className="block mb-2">Extracted Text (edit if needed):</label>
                    <Textarea
                      value={ingredients}
                      onChange={(e) => setIngredients(e.target.value)}
                      rows={4}
                      className="w-full"
                      placeholder="Extracted ingredients will appear here..."
                    />
                    <p className="text-sm text-muted-foreground mt-1">
                      Please review and edit the extracted text to ensure accuracy before analysis
                    </p>
                  </div>
                )}
              </div>
            </TabsContent>
            
            <TabsContent value="text" className="space-y-4 mt-6">
              <div>
                <label htmlFor="ingredients" className="block mb-2">
                  Ingredients (separate with commas)
                </label>
                <Textarea
                  id="ingredients"
                  placeholder="e.g., organic tomatoes, water, sea salt, basil, oregano, garlic powder"
                  value={ingredients}
                  onChange={(e) => setIngredients(e.target.value)}
                  rows={4}
                  className="w-full"
                />
              </div>
            </TabsContent>
          </Tabs>
          
          {!showAddProductForm && (
            <div className="mt-6">
              <Button 
                onClick={analyzeIngredients}
                disabled={!ingredients.trim() || isAnalyzing}
                className="w-full"
              >
                {isAnalyzing ? 'Analyzing...' : 'Analyze Ingredients'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {analysis && (() => {
        const dietLabel = getDietLabel(analysis.dietPreference);
        const hasDietConflict = Boolean(dietLabel && analysis.dietHits && analysis.dietHits.length > 0);
        const hasAllergyConflict = Boolean(analysis.allergyHits && analysis.allergyHits.length > 0);
        const cardStatus = !analysis.isClean
          ? 'notClean'
          : hasDietConflict || hasAllergyConflict
            ? 'preferenceConflict'
            : 'clean';
        const title = cardStatus === 'clean'
          ? 'Clean'
          : cardStatus === 'preferenceConflict'
            ? 'Clean, but not for you'
            : 'Not clean';
        const dietReason = analysis.dietHits && analysis.dietHits.length > 0
          ? analysis.dietHits.join(', ')
          : null;
        const selectedAllergies = Array.isArray(analysis.allergyPreferences) ? analysis.allergyPreferences : [];
        const uniqueAllergies = Array.from(new Set(selectedAllergies));
        const allergyHits = Array.isArray(analysis.allergyHits) ? analysis.allergyHits : [];
        const allergyHeaderClass = hasAllergyConflict ? 'text-red-600' : 'text-emerald-600';
        const AllergyHeaderIcon = hasAllergyConflict ? AlertTriangle : CheckCircle;
        const description = cardStatus === 'clean'
          ? 'We did not detect any red-flag additives or personalised issues.'
          : cardStatus === 'preferenceConflict'
            ? null
            : 'The analyzer detected red-flag ingredients.';
        const Icon = cardStatus === 'notClean' ? XCircle : cardStatus === 'preferenceConflict' ? AlertTriangle : CheckCircle;
        const iconColor =
          cardStatus === 'notClean'
            ? 'rgb(220 38 38)' // tailwind red-600
            : cardStatus === 'preferenceConflict'
              ? 'rgb(217 119 6)' // tailwind amber-600
              : 'rgb(22 163 74)'; // tailwind green-600
        return (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-3xl sm:text-4xl font-extrabold">
              <Icon className="h-7 w-7" style={{ color: iconColor }} />
              {title}
            </CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </CardHeader>
          <CardContent className="space-y-6">
            {flaggedMatches.length > 0 && (
              <div>
                <h4 className="mb-2 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                  Flagged Ingredients
                </h4>
                <div className="flex flex-wrap gap-2">
                  {flaggedMatches.map(({ key, label, match }, index) => {
                    const badgeKey = `${key}-${index}`;
                    const isClickable = Boolean(match && onNavigateToGuide);

                    if (isClickable && match) {
                      return (
                        <Badge
                          key={badgeKey}
                          variant="destructive"
                          className={cn('select-none cursor-pointer')}
                          asChild
                        >
                          <button
                            type="button"
                            onClick={() =>
                              onNavigateToGuide?.({
                                section: match.section,
                                slug: match.item.slug,
                                name: match.item.name,
                              })
                            }
                            className="inline-flex items-center gap-1"
                            aria-label={`View ${match.item.name} in the clean eating guide`}
                          >
                            {label}
                          </button>
                        </Badge>
                      );
                    }

                    return (
                      <Badge key={badgeKey} variant="destructive" className="select-none">
                        {label}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            )}


            {analysis.dietPreference && analysis.dietPreference !== 'none' && (
              <div>
                <h4 className="mb-2 flex items-center gap-2 text-amber-600">
                  <Leaf className="h-4 w-4" />
                  {dietLabels[analysis.dietPreference] || 'Dietary preference'}
                </h4>
                {analysis.dietHits && analysis.dietHits.length > 0 ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900">
                    <p className="font-medium mb-2">This product conflicts with your preference:</p>
                    <ul className="list-disc list-inside space-y-1">
                      {analysis.dietHits.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-900">
                    Matches your {dietLabels[analysis.dietPreference] || analysis.dietPreference} preference.
                  </div>
                )}
              </div>
            )}

            {selectedAllergies.length > 0 && (
              <div>
                <h4 className={`mb-2 flex items-center gap-2 ${allergyHeaderClass}`}>
                  <AllergyHeaderIcon className="h-4 w-4" />
                  Allergies & Sensitivities
                </h4>
                {hasAllergyConflict ? (
                  <div className="rounded-lg border border-red-200 bg-red-50/70 p-4 text-sm text-red-900">
                    <p className="font-medium mb-2">
                      Matches your allergy list{uniqueAllergies.length ? ` (${uniqueAllergies.join(', ')})` : ''}:
                    </p>
                    <ul className="list-disc list-inside space-y-1">
                      {allergyHits.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-900">
                    No ingredients matched your allergies ({uniqueAllergies.join(', ')}).
                  </div>
                )}
              </div>
            )}

            {analysis.parsedIngredients.length > 0 && (
              <div>
                <h4 className="mb-2">Parsed Ingredients</h4>
                <div className="flex flex-wrap gap-2">
                  {analysis.parsedIngredients.map((ingredient, index) => (
                    <Badge key={`${ingredient}-${index}`} variant="outline">
                      {ingredient}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {analysis.taxonomy.length > 0 && (
              <div className="space-y-3">
                <h4 className="mb-2">Ingredient Details</h4>
                <div className="space-y-3">
                  {analysis.taxonomy.map((entry, index) => (
                    <div key={entry.id ?? index} className="rounded-lg border p-3 bg-muted/30">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="font-medium">
                          {entry.display || entry.id || 'Ingredient'}
                        </span>
                        {entry.source && (
                          <Badge variant="secondary">{entry.source}</Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground space-y-1">
                        {entry.parents && entry.parents.length > 0 && (
                          <div>
                            <strong>Parents:</strong> {entry.parents.slice(0, 3).join(' › ')}
                          </div>
                        )}
                        {entry.synonyms && entry.synonyms.length > 0 && (
                          <div>
                            <strong>Synonyms:</strong> {entry.synonyms.slice(0, 6).join(', ')}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(analysis.taxonomyError || analysis.additivesError) && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="space-y-1 text-sm">
                  <div>Some taxonomy information could not be loaded.</div>
                  {analysis.taxonomyError && <div>Ingredients taxonomy: {analysis.taxonomyError}</div>}
                  {analysis.additivesError && <div>Additives taxonomy: {analysis.additivesError}</div>}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
        );
      })()}

      {/* OCR Camera Permission Dialog */}
      <Dialog open={showOcrCameraPrompt} onOpenChange={setShowOcrCameraPrompt}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="h-5 w-5" />
              Camera Access Required
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 text-left">
                <div className="flex items-start gap-2">
                  <Info className="h-4 w-4 mt-0.5 text-blue-500 flex-shrink-0" />
                  <span>This app needs access to your camera to capture ingredient labels for text extraction.</span>
                </div>
                
                <div className="bg-muted p-3 rounded-lg text-sm">
                  <div className="font-medium mb-2">What will happen next:</div>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Your browser will ask for camera permission</li>
                    <li>Click "Allow" to enable the camera</li>
                    <li>Position the ingredient list in the camera view</li>
                    <li>Capture and process the image</li>
                  </ol>
                </div>
                
                <div className="text-xs text-muted-foreground">
                  Your privacy is protected - images are processed locally and never stored on our servers.
                </div>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:justify-between">
            <Button
              variant="outline"
              onClick={() => setShowOcrCameraPrompt(false)}
            >
              Cancel
            </Button>
            <Button onClick={startOcrCamera}>
              Enable Camera
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Barcode Camera Permission Dialog */}
      <Dialog open={showCameraPrompt} onOpenChange={setShowCameraPrompt}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="h-5 w-5" />
              Camera Access Required
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 text-left">
                <div className="flex items-start gap-2">
                  <Info className="h-4 w-4 mt-0.5 text-blue-500 flex-shrink-0" />
                  <span>This app needs access to your camera to scan product barcodes.</span>
                </div>
                
                <div className="bg-muted p-3 rounded-lg text-sm">
                  <div className="font-medium mb-2">What will happen next:</div>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Your browser will ask for camera permission</li>
                    <li>Click "Allow" to enable the camera</li>
                    <li>Point your camera at a product barcode</li>
                    <li>Tap "Scan Barcode" to read the code</li>
                  </ol>
                </div>
                
                <div className="text-xs text-muted-foreground">
                  Your privacy is protected - camera feed stays on your device.
                </div>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:justify-between">
            <Button
              variant="outline"
              onClick={() => setShowCameraPrompt(false)}
            >
              Cancel
            </Button>
            <Button onClick={startCamera}>
              Enable Camera
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
