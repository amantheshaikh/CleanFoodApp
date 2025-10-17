import { useMemo, useRef, useState } from 'react';
import { OcrCaptureTab } from './OcrCaptureTab';
import { useOcrCapture } from './hooks/useOcrCapture';
import { ImageCropDialog } from '../imagecropdialogbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Camera, Info } from 'lucide-react';

interface OcrCaptureSectionProps {
  ingredients: string;
  onIngredientsChange: (text: string) => void;
}

export function OcrCaptureSection({ ingredients, onIngredientsChange }: OcrCaptureSectionProps) {
  const [cameraPermission, setCameraPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    ocrVideoRef,
    ocrCanvasRef,
    isProcessingImage,
    isOcrCameraActive,
    ocrCameraError,
    showOcrCameraPrompt,
    setShowOcrCameraPrompt,
    croppingImage,
    isCropDialogOpen,
    startOcrCamera,
    stopOcrCamera,
    captureForOcr,
    handleImageUpload,
    handleCropComplete,
    handleCropCancel,
  } = useOcrCapture({
    onTextExtracted: onIngredientsChange,
    onPermissionChange: setCameraPermission,
  });

  const canUseCamera = useMemo(
    () => typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices),
    []
  );

  return (
    <div className="space-y-4">
      <OcrCaptureTab
        isOcrCameraActive={isOcrCameraActive}
        isProcessingImage={isProcessingImage}
        ocrCameraError={ocrCameraError}
        cameraPermission={cameraPermission}
        showOcrCameraPrompt={() => setShowOcrCameraPrompt(true)}
        fileInputRef={fileInputRef}
        ocrVideoRef={ocrVideoRef}
        ocrCanvasRef={ocrCanvasRef}
        ingredients={ingredients}
        activeTab="ocr"
        onIngredientsChange={onIngredientsChange}
        captureForOcr={captureForOcr}
        stopOcrCamera={stopOcrCamera}
        handleImageUpload={handleImageUpload}
      />

      {croppingImage && (
        <ImageCropDialog
          isOpen={isCropDialogOpen}
          imageSrc={croppingImage}
          onCropComplete={handleCropComplete}
          onCancel={handleCropCancel}
        />
      )}

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
            <Button variant="outline" onClick={() => setShowOcrCameraPrompt(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setShowOcrCameraPrompt(false);
                startOcrCamera();
              }}
              disabled={!canUseCamera}
            >
              Enable Camera
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
