import { useState, useRef, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Loader2, Crop, RotateCw } from 'lucide-react';
import ReactCrop, { Crop as CropType, PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

interface ImageCropDialogProps {
  isOpen: boolean;
  imageSrc: string;
  onCropComplete: (croppedImageBlob: Blob) => void;
  onCancel: () => void;
}

export function ImageCropDialog({
  isOpen,
  imageSrc,
  onCropComplete,
  onCancel,
}: ImageCropDialogProps) {
  const [crop, setCrop] = useState<CropType>({
    unit: '%',
    x: 10,
    y: 10,
    width: 80,
    height: 80,
  });
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [rotation, setRotation] = useState(0);
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (isOpen) {
      setCrop({
        unit: '%',
        x: 10,
        y: 10,
        width: 80,
        height: 80,
      });
      setCompletedCrop(null);
      setRotation(0);
    }
  }, [isOpen, imageSrc]);

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const getCroppedImage = async (): Promise<Blob | null> => {
    if (!completedCrop || !imgRef.current || !canvasRef.current) {
      return null;
    }

    const canvas = canvasRef.current;
    const image = imgRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      return null;
    }

    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;

    canvas.width = completedCrop.width * scaleX;
    canvas.height = completedCrop.height * scaleY;

    if (rotation !== 0) {
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.translate(-centerX, -centerY);
    }

    ctx.drawImage(
      image,
      completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY,
      0,
      0,
      canvas.width,
      canvas.height,
    );

    if (rotation !== 0) {
      ctx.restore();
    }

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob || null);
      }, 'image/jpeg', 0.95);
    });
  };

  const handleCropConfirm = async () => {
    setIsProcessing(true);

    try {
      const croppedBlob = await getCroppedImage();

      if (croppedBlob) {
        onCropComplete(croppedBlob);
      } else {
        console.error('Failed to create cropped image');
      }
    } catch (error) {
      console.error('Error cropping image:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-[min(420px,100vw-1.5rem)] sm:max-w-3xl max-h-[90vh] overflow-hidden p-0 sm:p-0 flex flex-col">
        <DialogHeader className="px-4 pt-4 sm:px-6 sm:pt-6">
          <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Crop className="h-5 w-5" />
            Crop Ingredient Label
          </DialogTitle>
          <DialogDescription asChild>
            <div className="text-sm sm:text-base text-muted-foreground">
              Adjust the crop area to include only the ingredient list for better results.
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4 sm:px-6 sm:pb-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRotate}
                className="flex w-full max-w-[220px] items-center justify-center gap-2 sm:w-auto"
              >
                <RotateCw className="h-4 w-4" />
                Rotate 90°
              </Button>
            </div>

            <div className="flex justify-center items-center bg-muted/30 rounded-lg p-3 sm:p-4 min-h-[240px] sm:min-h-[300px]">
              <ReactCrop
                crop={crop}
                onChange={(c) => setCrop(c)}
                onComplete={(c) => setCompletedCrop(c)}
                className="max-w-full flex-1"
              >
                <img
                  ref={imgRef}
                  src={imageSrc}
                  alt="Crop preview"
                  className="max-h-[60vh] w-full object-contain"
                  style={{
                    transform: `rotate(${rotation}deg)`,
                    transition: 'transform 0.3s ease',
                  }}
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    const width = img.width;
                    const height = img.height;
                    setCrop({
                      unit: 'px',
                      x: width * 0.1,
                      y: height * 0.1,
                      width: width * 0.8,
                      height: height * 0.8,
                    });
                  }}
                />
              </ReactCrop>
            </div>

            <canvas ref={canvasRef} className="hidden" />
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 px-4 pb-4 sm:px-6 sm:pb-6">
          <Button variant="outline" onClick={onCancel} disabled={isProcessing}>
            Cancel
          </Button>
          <Button
            onClick={handleCropConfirm}
            disabled={isProcessing || !completedCrop}
            className="flex w-full items-center justify-center gap-2 sm:w-auto"
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Crop className="h-4 w-4" />
                Crop & Process
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
