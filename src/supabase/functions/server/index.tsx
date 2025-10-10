import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";

const app = new Hono();

// Initialize Supabase client
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const OFF_WRITE_BASE_URL = Deno.env.get('OFF_WRITE_BASE_URL') || 'https://world.openfoodfacts.org';
const OFF_WRITE_USER = Deno.env.get('OFF_USER') || '';
const OFF_WRITE_PASSWORD = Deno.env.get('OFF_PASSWORD') || '';
const OFF_WRITE_COMMENT = Deno.env.get('OFF_COMMENT') || 'Submitted via CleanFoodApp';

const STRICTNESS_OPTIONS = new Set(['lenient', 'moderate', 'strict']);
const DIET_OPTIONS = ['none', 'vegetarian', 'vegan', 'jain'] as const;
type DietaryPreference = typeof DIET_OPTIONS[number];

interface NormalisedPreferences {
  strictness: 'lenient' | 'moderate' | 'strict';
  allergies: string[];
  dietary_preference: DietaryPreference;
}

const DEFAULT_PREFERENCES: NormalisedPreferences = {
  strictness: 'moderate',
  allergies: [],
  dietary_preference: 'none',
};

function normalisePreferences(raw: unknown): NormalisedPreferences {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_PREFERENCES };
  }
  const input = raw as Record<string, unknown>;

  let strictness = (typeof input.strictness === 'string' ? input.strictness.toLowerCase() : 'moderate');
  if (!STRICTNESS_OPTIONS.has(strictness)) {
    strictness = 'moderate';
  }

  const allergies = Array.isArray(input.allergies)
    ? input.allergies
        .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
        .map((entry) => entry.trim())
    : [];

  let dietValue: string | null = null;
  const possibleDiet = input.dietary_preference ?? input.diet ?? input.dietaryRestriction ?? input.dietary_restrictions;
  if (typeof possibleDiet === 'string') {
    dietValue = possibleDiet.toLowerCase();
  } else if (Array.isArray(possibleDiet) && possibleDiet.length) {
    const first = possibleDiet[0];
    if (typeof first === 'string') {
      dietValue = first.toLowerCase();
    }
  }
  const diet: DietaryPreference = (dietValue && DIET_OPTIONS.includes(dietValue as DietaryPreference)) ? (dietValue as DietaryPreference) : 'none';

  return {
    strictness: strictness as NormalisedPreferences['strictness'],
    allergies,
    dietary_preference: diet,
  };
}

// Enable logger
app.use('*', logger(console.log));

// Enable CORS for all routes and methods
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

// Helper function to get user from token
async function getUserFromToken(token: string) {
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return null;
    }
    return user;
  } catch (error) {
    console.log('Error getting user from token:', error);
    return null;
  }
}

// Health check endpoint
app.get("/make-server-5111eaf7/health", (c) => {
  return c.json({ status: "ok" });
});

// User signup endpoint
app.post("/make-server-5111eaf7/signup", async (c) => {
  try {
    const { email, password, name } = await c.req.json();
    
    if (!email || !password || !name) {
      return c.json({ error: "Email, password, and name are required" }, 400);
    }

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { name },
      // Automatically confirm the user's email since an email server hasn't been configured.
      email_confirm: true
    });

    if (error) {
      console.log('Signup error:', error);
      return c.json({ error: error.message }, 400);
    }

    return c.json({ user: data.user });
  } catch (error) {
    console.log('Signup error:', error);
    return c.json({ error: "Internal server error during signup" }, 500);
  }
});

// Save analysis result
app.post("/make-server-5111eaf7/analysis", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    const body = await c.req.json();
    
    const { ingredients, analysis } = body;
    
    if (!ingredients || !analysis) {
      return c.json({ error: "Ingredients and analysis are required" }, 400);
    }

    const analysisId = `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const analysisData = {
      id: analysisId,
      ingredients,
      analysis,
      timestamp: new Date().toISOString(),
      user_id: null as string | null
    };

    // If user is authenticated, save with user ID
    if (accessToken) {
      const user = await getUserFromToken(accessToken);
      if (user) {
        analysisData.user_id = user.id;
      }
    }

    await kv.set(analysisId, analysisData);
    
    return c.json({ id: analysisId, message: "Analysis saved successfully" });
  } catch (error) {
    console.log('Error saving analysis:', error);
    return c.json({ error: "Failed to save analysis" }, 500);
  }
});

// Get user's analysis history
app.get("/make-server-5111eaf7/analysis/history", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: "Authorization required" }, 401);
    }

    const user = await getUserFromToken(accessToken);
    if (!user) {
      return c.json({ error: "Invalid token" }, 401);
    }

    // Get all analysis results for this user
    const allAnalyses = await kv.getByPrefix('analysis_');
    const userAnalyses = allAnalyses
      .filter(item => item.user_id === user.id)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 50); // Limit to last 50 analyses

    return c.json({ analyses: userAnalyses });
  } catch (error) {
    console.log('Error fetching analysis history:', error);
    return c.json({ error: "Failed to fetch analysis history" }, 500);
  }
});

// Save user preferences
app.post("/make-server-5111eaf7/preferences", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: "Authorization required" }, 401);
    }

    const user = await getUserFromToken(accessToken);
    if (!user) {
      return c.json({ error: "Invalid token" }, 401);
    }

    const preferences = await c.req.json();
    const normalised = normalisePreferences(preferences);
    const preferencesKey = `preferences_${user.id}`;
    
    await kv.set(preferencesKey, {
      user_id: user.id,
      preferences: normalised,
      updated_at: new Date().toISOString()
    });

    return c.json({ message: "Preferences saved successfully" });
  } catch (error) {
    console.log('Error saving preferences:', error);
    return c.json({ error: "Failed to save preferences" }, 500);
  }
});

// Get user preferences
app.get("/make-server-5111eaf7/preferences", async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    
    if (!accessToken) {
      return c.json({ error: "Authorization required" }, 401);
    }

    const user = await getUserFromToken(accessToken);
    if (!user) {
      return c.json({ error: "Invalid token" }, 401);
    }

    const preferencesKey = `preferences_${user.id}`;
    const preferencesData = await kv.get(preferencesKey);
    const normalised = normalisePreferences(preferencesData?.preferences);
    
    return c.json({ 
      preferences: normalised,
    });
  } catch (error) {
    console.log('Error fetching preferences:', error);
    return c.json({ error: "Failed to fetch preferences" }, 500);
  }
});

// Submit general feedback
app.post("/make-server-5111eaf7/feedback", async (c) => {
  try {
    const body = await c.req.json();

    const message = typeof body?.message === 'string' ? body.message.trim() : '';
    if (!message) {
      return c.json({ error: "Feedback message is required" }, 400);
    }

    const rawName = typeof body?.name === 'string' ? body.name.trim() : '';
    const rawEmail = typeof body?.email === 'string' ? body.email.trim() : '';
    const rawRating = body?.rating;

    const name = rawName.slice(0, 120);
    const email = rawEmail.slice(0, 160);
    let rating: number | null = null;
    if (typeof rawRating === 'number' && Number.isFinite(rawRating)) {
      const rounded = Math.round(rawRating);
      if (rounded >= 1 && rounded <= 5) {
        rating = rounded;
      }
    }

    let userId: string | null = null;
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (accessToken) {
      try {
        const user = await getUserFromToken(accessToken);
        if (user) {
          userId = user.id;
        }
      } catch (err) {
        console.log('Feedback user lookup failed', err);
      }
    }

    const feedbackId = `feedback_general_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    await kv.set(feedbackId, {
      id: feedbackId,
      user_id: userId,
      name,
      email,
      rating,
      message,
      created_at: new Date().toISOString(),
    });

    return c.json({ message: "Thank you for your feedback!" });
  } catch (error) {
    console.log('Error saving feedback:', error);
    return c.json({ error: "Failed to submit feedback" }, 500);
  }
});

// Report ingredient feedback
app.post("/make-server-5111eaf7/ingredient/feedback", async (c) => {
  try {
    const { ingredient, isClean, reason } = await c.req.json();
    
    if (!ingredient || typeof isClean !== 'boolean') {
      return c.json({ error: "Ingredient and isClean status are required" }, 400);
    }

    const feedbackId = `feedback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await kv.set(feedbackId, {
      id: feedbackId,
      ingredient: ingredient.toLowerCase(),
      isClean,
      reason: reason || '',
      timestamp: new Date().toISOString()
    });

    return c.json({ message: "Feedback submitted successfully" });
  } catch (error) {
    console.log('Error saving ingredient feedback:', error);
    return c.json({ error: "Failed to save feedback" }, 500);
  }
});

// Fetch product from OpenFoodFacts by barcode
app.get("/make-server-5111eaf7/product/:barcode", async (c) => {
  try {
    const barcode = c.req.param('barcode');
    
    if (!barcode) {
      return c.json({ error: "Barcode is required" }, 400);
    }

    // Clean barcode - remove any non-numeric characters
    const cleanBarcode = barcode.replace(/\D/g, '');
    
    if (!cleanBarcode) {
      return c.json({ error: "Invalid barcode format" }, 400);
    }

    console.log(`Fetching product data for barcode: ${cleanBarcode}`);
    
    // Fetch from OpenFoodFacts API
    const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${cleanBarcode}.json`);
    
    if (!response.ok) {
      console.log(`OpenFoodFacts API error: ${response.status} ${response.statusText}`);
      return c.json({ error: "Failed to fetch product data", found: false }, 404);
    }

    const data = await response.json();
    
    if (!data.product || data.status === 0) {
      console.log(`Product not found in OpenFoodFacts database: ${cleanBarcode}`);
      return c.json({ 
        error: "Product not found", 
        found: false, 
        barcode: cleanBarcode,
        message: "This product is not in the OpenFoodFacts database yet. You can help add it!" 
      }, 404);
    }

    // Extract relevant product information
    const product = {
      barcode: cleanBarcode,
      name: data.product.product_name || 'Unknown Product',
      brand: data.product.brands || '',
      categories: data.product.categories || '',
      ingredients_text: data.product.ingredients_text || '',
      image_url: data.product.image_url || '',
      image_front_url: data.product.image_front_url || '',
      image_ingredients_url: data.product.image_ingredients_url || '',
      image_nutrition_url: data.product.image_nutrition_url || '',
      quantity: data.product.quantity || '',
      languages: data.product.languages_codes || ['en'],
      found: true
    };

    console.log(`Product found: ${product.name} by ${product.brand}`);
    
    return c.json({ product });
  } catch (error) {
    console.log('Error fetching product from OpenFoodFacts:', error);
    return c.json({ error: "Failed to fetch product data", found: false }, 500);
  }
});

// Submit new product to OpenFoodFacts
app.post("/make-server-5111eaf7/product/submit", async (c) => {
  try {
    if (!OFF_WRITE_USER || !OFF_WRITE_PASSWORD) {
      console.log('OpenFoodFacts credentials missing - cannot submit product');
      return c.json({ error: "OpenFoodFacts credentials are not configured on the server." }, 500);
    }

    const formData = await c.req.formData();
    
    const barcode = formData.get('barcode') as string;
    const productName = formData.get('product_name') as string;
    const brands = formData.get('brands') as string;
    const quantity = formData.get('quantity') as string;
    const categories = formData.get('categories') as string;
    const ingredientsText = formData.get('ingredients_text') as string;
    const language = formData.get('lc') as string || 'en';

    if (!barcode || !productName) {
      return c.json({ error: "Barcode and product name are required" }, 400);
    }

    console.log(`Submitting new product to OpenFoodFacts: ${productName} (${barcode})`);

    // Prepare form data for OpenFoodFacts API
    const offFormData = new FormData();
    offFormData.append('code', barcode);
    offFormData.append('product_name', productName);
    offFormData.append('lc', language);
    offFormData.append('user_id', OFF_WRITE_USER);
    offFormData.append('password', OFF_WRITE_PASSWORD);
    offFormData.append('comment', OFF_WRITE_COMMENT);
    offFormData.append('action', 'process');
    
    if (brands) offFormData.append('brands', brands);
    if (quantity) offFormData.append('quantity', quantity);
    if (categories) offFormData.append('categories', categories);
    if (ingredientsText) offFormData.append('ingredients_text', ingredientsText);
    if (ingredientsText) offFormData.append(`ingredients_text_${language}`, ingredientsText);

    // Submit to OpenFoodFacts
    const response = await fetch(`${OFF_WRITE_BASE_URL}/cgi/product_jqm2.pl`, {
      method: 'POST',
      body: offFormData
    });

    if (!response.ok) {
      console.log(`OpenFoodFacts submission error: ${response.status}`);
      return c.json({ error: "Failed to submit product to OpenFoodFacts" }, 500);
    }

    const result = await response.text();
    console.log(`Product submission result: ${result}`);

    // Store submission record locally
    const submissionId = `submission_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await kv.set(submissionId, {
      id: submissionId,
      barcode,
      product_name: productName,
      brands,
      quantity,
      categories,
      ingredients_text: ingredientsText,
      language,
      submitted_at: new Date().toISOString(),
      off_response: result
    });

    return c.json({ 
      success: true, 
      message: "Product submitted successfully to OpenFoodFacts",
      barcode,
      product_url: `https://world.openfoodfacts.org/product/${barcode}`
    });
  } catch (error) {
    console.log('Error submitting product to OpenFoodFacts:', error);
    return c.json({ error: "Failed to submit product" }, 500);
  }
});

// Upload product images to OpenFoodFacts
app.post("/make-server-5111eaf7/product/:barcode/image/:imageType", async (c) => {
  try {
    if (!OFF_WRITE_USER || !OFF_WRITE_PASSWORD) {
      console.log('OpenFoodFacts credentials missing - cannot upload image');
      return c.json({ error: "OpenFoodFacts credentials are not configured on the server." }, 500);
    }

    const barcode = c.req.param('barcode');
    const imageType = c.req.param('imageType'); // front, ingredients, nutrition
    
    if (!barcode || !imageType) {
      return c.json({ error: "Barcode and image type are required" }, 400);
    }

    if (!['front', 'ingredients', 'nutrition'].includes(imageType)) {
      return c.json({ error: "Invalid image type. Must be front, ingredients, or nutrition" }, 400);
    }

    const formData = await c.req.formData();
    const imageFile = formData.get('imgupload_' + imageType) as File;
    const language = ((formData.get('lc') as string) || 'en').toLowerCase();
    
    if (!imageFile) {
      return c.json({ error: "Image file is required" }, 400);
    }

    console.log(`Uploading ${imageType} image for product ${barcode}`);

    // Prepare form data for OpenFoodFacts image upload API
    const offFormData = new FormData();
    offFormData.append('code', barcode);
    const imageFieldMap: Record<string, string> = {
      front: `front_${language}`,
      ingredients: `ingredients_${language}`,
      nutrition: `nutrition_${language}`,
    };
    offFormData.append('imagefield', imageFieldMap[imageType] || `${imageType}_${language}`);
    offFormData.append('imgupload_' + imageType, imageFile);
    offFormData.append('user_id', OFF_WRITE_USER);
    offFormData.append('password', OFF_WRITE_PASSWORD);
    offFormData.append('comment', OFF_WRITE_COMMENT);

    // Submit to OpenFoodFacts image upload endpoint
    const response = await fetch(`${OFF_WRITE_BASE_URL}/cgi/product_image_upload.pl`, {
      method: 'POST',
      body: offFormData
    });

    if (!response.ok) {
      console.log(`OpenFoodFacts image upload error: ${response.status}`);
      return c.json({ error: "Failed to upload image to OpenFoodFacts" }, 500);
    }

    const result = await response.text();
    console.log(`Image upload result: ${result}`);

    return c.json({ 
      success: true, 
      message: `${imageType} image uploaded successfully`,
      barcode
    });
  } catch (error) {
    console.log('Error uploading image to OpenFoodFacts:', error);
    return c.json({ error: "Failed to upload image" }, 500);
  }
});

Deno.serve(app.fetch);
