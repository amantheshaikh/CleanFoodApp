import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProductSummary } from '../../../types/openFoodFacts';

type CameraPermissionState = 'unknown' | 'granted' | 'denied';

interface UseBarcodeScannerOptions {
  onIngredientsFound: (text: string) => void;
  onAnalyzeText: (text: string) => Promise<void>;
  onPermissionChange?: (state: CameraPermissionState) => void;
}

export function useBarcodeScanner({
  onIngredientsFound,
  onAnalyzeText,
  onPermissionChange,
}: UseBarcodeScannerOptions) {
  const [isScanning, setIsScanning] = useState(false);
  const [showCameraPrompt, setShowCameraPrompt] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [barcodeError, setBarcodeError] = useState<string | null>(null);
  const [barcodeDebug, setBarcodeDebug] = useState<string | null>(null);
  const [scannedBarcode, setScannedBarcode] = useState<string | null>(null);
  const [showAddProductForm, setShowAddProductForm] = useState(false);
  const [productFound, setProductFound] = useState<ProductSummary | null>(null);
  const [isLoadingProduct, setIsLoadingProduct] = useState(false);

  const quaggaContainerRef = useRef<HTMLDivElement | null>(null);
  const quaggaRef = useRef<any>(null);
  const quaggaOnDetectedRef = useRef<any>(null);
  const quaggaOnProcessedRef = useRef<any>(null);
  const barcodeDetectionAttemptsRef = useRef(0);
  const barcodeDetectedRef = useRef(false);
  const productFetchControllerRef = useRef<AbortController | null>(null);
  const activeRequestIdRef = useRef(0);

  const abortProductFetch = useCallback(() => {
    if (productFetchControllerRef.current) {
      productFetchControllerRef.current.abort();
      productFetchControllerRef.current = null;
    }
  }, []);

  const cleanupQuagga = useCallback(() => {
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
    } catch (error) {
      console.debug('Error stopping Quagga:', error);
    }
    barcodeDetectionAttemptsRef.current = 0;
    barcodeDetectedRef.current = false;
  }, []);

  const stopCamera = useCallback(() => {
    cleanupQuagga();
    abortProductFetch();
    setIsScanning(false);
    setCameraError(null);
    setBarcodeDebug(null);
  }, [abortProductFetch, cleanupQuagga]);

  const loadQuagga = useCallback(async () => {
    if (quaggaRef.current) {
      return quaggaRef.current;
    }
    const module = await import('https://cdn.skypack.dev/@ericblade/quagga2@1.2.6?min');
    quaggaRef.current = module.default || module;
    return quaggaRef.current;
  }, []);

  const extractIngredientsFromProduct = useCallback((product: any): string | null => {
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
  }, []);

  const fetchProductInfo = useCallback(async (barcode: string) => {
    try {
      abortProductFetch();
      const controller = new AbortController();
      productFetchControllerRef.current = controller;
      const requestId = activeRequestIdRef.current + 1;
      activeRequestIdRef.current = requestId;

      setIsLoadingProduct(true);
      setBarcodeError(null);
      setScannedBarcode(barcode);

      console.log(`Fetching product info for barcode: ${barcode}`);

      const fields = [
        'code',
        'product_name',
        'brands',
        'quantity',
        'ingredients_text',
        'ingredients_text_en',
        'ingredients',
        'image_ingredients_url',
      ];
      const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${fields.join(',')}`;
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
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
      const productSummary: ProductSummary = {
        name: product.product_name || 'Unnamed product',
        brand: product.brands || undefined,
        quantity: product.quantity || undefined,
        barcode: product.code || barcode,
      };

      setProductFound(productSummary);
      setBarcodeDebug(`Fetched product from Open Food Facts (${productSummary.name})`);

      const ingredientText = extractIngredientsFromProduct(product);

      if (ingredientText) {
        onIngredientsFound(ingredientText);
        try {
          await onAnalyzeText(ingredientText);
          setBarcodeDebug((prev) => (prev ? `${prev} • Analysis complete.` : 'Analysis complete.'));
        } catch (analysisError) {
          console.error('Failed to analyze ingredients from Open Food Facts', analysisError);
          setBarcodeDebug('Retrieved ingredients but analysis failed. Check console for details.');
        }
      } else {
        setBarcodeError('Product found but no ingredients listed. You can help add the missing details.');
        setBarcodeDebug('Product had no ingredient text. Prompting manual contribution.');
        setShowAddProductForm(true);
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        return;
      }
      console.error('Error fetching product info:', error);
      setBarcodeError('Failed to fetch product information. Please try again or enter ingredients manually.');
    } finally {
      if (activeRequestIdRef.current === requestId) {
        setIsLoadingProduct(false);
        if (productFetchControllerRef.current === controller) {
          productFetchControllerRef.current = null;
        }
      }
    }
  }, [abortProductFetch, extractIngredientsFromProduct, onAnalyzeText, onIngredientsFound]);

  const startCamera = useCallback(async () => {
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

      Quagga.init(
        {
          inputStream: {
            type: 'LiveStream',
            target: quaggaContainerRef.current || undefined,
            constraints: {
              facingMode: 'environment',
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
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
        },
      );

      onPermissionChange?.('granted');
    } catch (error: any) {
      console.error('Camera access error:', error);
      setIsScanning(false);

      let errorMessage = '';
      if (error.name === 'NotAllowedError') {
        onPermissionChange?.('denied');
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
  }, [fetchProductInfo, loadQuagga, onPermissionChange, stopCamera]);

  const showCameraPermissionPrompt = useCallback(() => {
    setShowCameraPrompt(true);
  }, []);

  const handleProductAdded = useCallback((_productUrl: string) => {
    setShowAddProductForm(false);
    setScannedBarcode(null);
    setBarcodeError(null);

    if (scannedBarcode) {
      setTimeout(() => {
        fetchProductInfo(scannedBarcode);
      }, 1000);
    }
  }, [fetchProductInfo, scannedBarcode]);

  const resetScannerUi = useCallback(() => {
    abortProductFetch();
    setShowAddProductForm(false);
    setScannedBarcode(null);
    setBarcodeError(null);
    setProductFound(null);
    setBarcodeDebug(null);
  }, [abortProductFetch]);

  const handleCancelAddProduct = useCallback(() => {
    resetScannerUi();
  }, [resetScannerUi]);

  useEffect(() => {
    return () => {
      cleanupQuagga();
      abortProductFetch();
    };
  }, [abortProductFetch, cleanupQuagga]);

  return {
    // State
    isScanning,
    showCameraPrompt,
    cameraError,
    barcodeError,
    barcodeDebug,
    scannedBarcode,
    showAddProductForm,
    productFound,
    isLoadingProduct,

    // Refs
    quaggaContainerRef,

    // Actions
    startCamera,
    stopCamera,
    showCameraPermissionPrompt,
    setShowCameraPrompt,
    handleProductAdded,
    handleCancelAddProduct,
    resetScannerUi,
  };
}
