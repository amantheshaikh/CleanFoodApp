export interface OffProductInfo {
  barcode: string;
  name?: string;
  brand?: string;
  quantity?: string;
  categories?: string;
  ingredients_text?: string;
  language?: string;
}

export interface OffProductResponse {
  status: number;
  status_verbose?: string;
  product?: {
    code?: string;
    product_name?: string;
    brands?: string;
    quantity?: string;
    categories?: string;
    ingredients_text?: string;
    ingredients_text_en?: string;
    ingredients_text_fr?: string;
    ingredients_text_es?: string;
    ingredients?: Array<string | { text?: string }>;
  };
}

export interface OffSubmissionResult {
  success: boolean;
  message: string;
  barcode: string;
  product_url: string;
}

export interface ProductSummary {
  barcode: string;
  name?: string;
  brand?: string;
  quantity?: string;
}
