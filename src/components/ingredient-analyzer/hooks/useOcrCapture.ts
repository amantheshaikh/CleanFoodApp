import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { toast } from 'sonner@2.0.3';

type CameraPermissionState = 'unknown' | 'granted' | 'denied';
type OcrSource = 'upload' | 'camera';

interface UseOcrCaptureOptions {
  onTextExtracted: (text: string) => void;
  onPermissionChange?: (state: CameraPermissionState) => void;
}

export function useOcrCapture({ onTextExtracted, onPermissionChange }: UseOcrCaptureOptions) {
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [isOcrCameraActive, setIsOcrCameraActive] = useState(false);
  const [ocrCameraError, setOcrCameraError] = useState<string | null>(null);
  const [showOcrCameraPrompt, setShowOcrCameraPrompt] = useState(false);
  const [croppingImage, setCroppingImage] = useState<string | null>(null);
  const [isCropDialogOpen, setIsCropDialogOpen] = useState(false);
  const [pendingOcrSource, setPendingOcrSource] = useState<OcrSource | null>(null);
  const [ocrCameraStream, setOcrCameraStream] = useState<MediaStream | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const extractTextFromImage = useCallback(async (imageFile: File): Promise<string> => {
    setIsProcessingImage(true);
    try {
      const Tesseract = await import('tesseract.js');
      const { data: { text } } = await Tesseract.recognize(imageFile, 'eng', {
        logger: (message: any) => {
          if (message?.status === 'recognizing text') {
            console.log(`OCR Progress: ${Math.round((message.progress ?? 0) * 100)}%`);
          }
        },
      });

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
      throw new Error(error?.message || 'Failed to extract text from image');
    } finally {
      setIsProcessingImage(false);
    }
  }, []);

  const fileToDataUrl = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }, []);

  const stopOcrCamera = useCallback(() => {
    if (ocrCameraStream) {
      ocrCameraStream.getTracks().forEach((track) => track.stop());
      setOcrCameraStream(null);
    }
    setIsOcrCameraActive(false);
    setOcrCameraError(null);
  }, [ocrCameraStream]);

  const openCropper = useCallback((imageSrc: string, source: OcrSource) => {
    setCroppingImage(imageSrc);
    setPendingOcrSource(source);
    setIsCropDialogOpen(true);
  }, []);

  const handleCropCancel = useCallback(() => {
    const source = pendingOcrSource;
    setIsCropDialogOpen(false);
    setCroppingImage(null);
    setPendingOcrSource(null);
    if (source === 'camera') {
      setShowOcrCameraPrompt(true);
    }
  }, [pendingOcrSource]);

  const handleCropComplete = useCallback(async (blob: Blob) => {
    const source = pendingOcrSource;
    try {
      const file = new File([blob], 'cropped-image.jpg', { type: blob.type || 'image/jpeg' });
      const extractedText = await extractTextFromImage(file);
      onTextExtracted(extractedText);
      setIsCropDialogOpen(false);
      setCroppingImage(null);
      setPendingOcrSource(null);
      if (source === 'camera') {
        stopOcrCamera();
      }
    } catch (error: any) {
      console.error('Crop processing failed:', error);
      toast.error(error?.message || 'Failed to process the cropped image. Please try again.');
    }
  }, [extractTextFromImage, onTextExtracted, pendingOcrSource, stopOcrCamera]);

  const handleImageUpload = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select a valid image file.');
      event.target.value = '';
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image file is too large. Please select an image smaller than 10MB.');
      event.target.value = '';
      return;
    }

    try {
      const dataUrl = await fileToDataUrl(file);
      openCropper(dataUrl, 'upload');
    } catch (error: any) {
      console.error('Image preview error:', error);
      toast.error(error?.message || 'Unable to prepare the image for cropping.');
    } finally {
      event.target.value = '';
    }
  }, [fileToDataUrl, openCropper]);

  const startOcrCamera = useCallback(async () => {
    setOcrCameraError(null);
    setIsOcrCameraActive(true);
    setShowOcrCameraPrompt(false);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera not supported on this device or browser. Please try uploading an image instead.');
      }

      if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
        throw new Error('Camera access requires a secure connection (HTTPS). Please try uploading an image instead.');
      }

      const constraints = {
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      };

      console.log('Requesting camera access for OCR...');
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setOcrCameraStream(stream);
      onPermissionChange?.('granted');

      const videoElement = videoRef.current;
      if (videoElement) {
        videoElement.srcObject = stream;
        await videoElement.play();
      }

      console.log('OCR Camera access granted successfully');
    } catch (error: any) {
      console.error('OCR Camera access error:', error);
      setIsOcrCameraActive(false);

      let errorMessage = '';
      if (error.name === 'NotAllowedError') {
        onPermissionChange?.('denied');
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
  }, [onPermissionChange]);

  const captureForOcr = useCallback(async () => {
    const videoElement = videoRef.current;
    const canvasElement = canvasRef.current;

    if (!videoElement || !canvasElement) {
      return;
    }

    const context = canvasElement.getContext('2d');
    if (!context) {
      console.error('Camera capture error: Unable to access drawing context');
      setOcrCameraError('Could not capture from camera. Please try again.');
      return;
    }

    let frameWidth = videoElement.videoWidth;
    let frameHeight = videoElement.videoHeight;

    if (!frameWidth || !frameHeight) {
      const trackSettings = ocrCameraStream?.getVideoTracks()?.[0]?.getSettings();
      frameWidth = trackSettings?.width ?? frameWidth;
      frameHeight = trackSettings?.height ?? frameHeight;
    }

    if (!frameWidth || !frameHeight) {
      const rect = videoElement.getBoundingClientRect();
      frameWidth = Math.round(rect.width);
      frameHeight = Math.round(rect.height);
    }

    if (!frameWidth || !frameHeight) {
      console.warn('Camera capture warning: Frame dimensions not ready');
      setOcrCameraError('Camera feed is still loading. Hold steady for a moment and try capturing again.');
      return;
    }

    canvasElement.width = frameWidth;
    canvasElement.height = frameHeight;
    context.drawImage(videoElement, 0, 0, frameWidth, frameHeight);

    try {
      const dataUrl = canvasElement.toDataURL('image/jpeg', 0.95);

      if (!dataUrl || dataUrl === 'data:' || dataUrl.length < 100) {
        throw new Error('Camera produced an empty frame');
      }

      openCropper(dataUrl, 'camera');
      stopOcrCamera();
    } catch (error: any) {
      console.error('Camera capture error:', error);
      setOcrCameraError(error?.message || 'Failed to capture image. Please try again.');
    }
  }, [ocrCameraStream, openCropper, stopOcrCamera]);

  useEffect(() => {
    return () => {
      if (ocrCameraStream) {
        ocrCameraStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [ocrCameraStream]);

  return {
    // Refs
    ocrVideoRef: videoRef,
    ocrCanvasRef: canvasRef,

    // State
    isProcessingImage,
    isOcrCameraActive,
    ocrCameraError,
    showOcrCameraPrompt,
    setShowOcrCameraPrompt,
    croppingImage,
    isCropDialogOpen,

    // Actions
    startOcrCamera,
    stopOcrCamera,
    captureForOcr,
    handleImageUpload,
    handleCropComplete,
    handleCropCancel,
  };
}
