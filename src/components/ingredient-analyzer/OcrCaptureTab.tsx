import { ChangeEvent } from 'react';
import { Button } from '../ui/button';
import { Alert, AlertDescription } from '../ui/alert';
import { Textarea } from '../ui/textarea';
import { Camera, Loader2, Upload } from 'lucide-react';

interface OcrCaptureTabProps {
  isOcrCameraActive: boolean;
  isProcessingImage: boolean;
  ocrCameraError: string | null;
  cameraPermission: 'unknown' | 'granted' | 'denied';
  showOcrCameraPrompt: () => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  ocrVideoRef: React.RefObject<HTMLVideoElement>;
  ocrCanvasRef: React.RefObject<HTMLCanvasElement>;
  ingredients: string;
  activeTab: string;
  onIngredientsChange: (value: string) => void;
  captureForOcr: () => void;
  stopOcrCamera: () => void;
  handleImageUpload: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
}

export function OcrCaptureTab({
  isOcrCameraActive,
  isProcessingImage,
  ocrCameraError,
  cameraPermission,
  showOcrCameraPrompt,
  fileInputRef,
  ocrVideoRef,
  ocrCanvasRef,
  ingredients,
  activeTab,
  onIngredientsChange,
  captureForOcr,
  stopOcrCamera,
  handleImageUpload,
}: OcrCaptureTabProps) {
  return (
    <div className="space-y-4">
      {ocrCameraError && (
        <Alert variant="destructive">
          <AlertDescription>
            <div className="space-y-3">
              <div className="whitespace-pre-line">{ocrCameraError}</div>
              {cameraPermission === 'denied' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={showOcrCameraPrompt}
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
            onClick={showOcrCameraPrompt}
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
          </div>
          
          <div className="flex gap-3 justify-center">
            <Button onClick={captureForOcr} disabled={isProcessingImage} className="flex items-center gap-2">
              <Camera className="h-4 w-4" />
              Capture & Crop
            </Button>
            <Button variant="outline" onClick={stopOcrCamera} disabled={isProcessingImage}>
              Cancel
            </Button>
          </div>
          
          <p className="text-sm text-muted-foreground">
            Capture the label, crop to the ingredient list, and we'll run OCR on the selected area.
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
            onChange={(e) => onIngredientsChange(e.target.value)}
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
  );
}
