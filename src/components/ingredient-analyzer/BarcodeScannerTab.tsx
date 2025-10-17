import { MutableRefObject } from 'react';
import { Alert, AlertDescription } from '../ui/alert';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { AlertTriangle, Camera, CheckCircle } from 'lucide-react';
import { AddProductForm } from '../AddProductForm';

import type { ProductSummary } from '../../types/openFoodFacts';

export interface BarcodeScannerTabProps {
  showAddProductForm: boolean;
  scannedBarcode: string | null;
  onProductAdded: (productUrl: string) => void;
  onCancelAddProduct: () => void;
  barcodeError: string | null;
  barcodeDebug: string | null;
  cameraError: string | null;
  cameraPermission: 'unknown' | 'granted' | 'denied';
  onRequestCameraPermission: () => void;
  isScanning: boolean;
  isLoadingProduct: boolean;
  onStartCamera: () => void;
  onStopCamera: () => void;
  productFound: ProductSummary | null;
  quaggaContainerRef: MutableRefObject<HTMLDivElement | null>;
  canUseCamera: boolean;
  ingredients: string;
  onIngredientsChange: (value: string) => void;
  activeTab: string;
}

export function BarcodeScannerTab({
  showAddProductForm,
  scannedBarcode,
  onProductAdded,
  onCancelAddProduct,
  barcodeError,
  barcodeDebug,
  cameraError,
  cameraPermission,
  onRequestCameraPermission,
  isScanning,
  isLoadingProduct,
  onStartCamera,
  onStopCamera,
  productFound,
  quaggaContainerRef,
  canUseCamera,
  ingredients,
  onIngredientsChange,
  activeTab,
}: BarcodeScannerTabProps) {
  if (showAddProductForm && scannedBarcode) {
    return (
      <AddProductForm
        barcode={scannedBarcode}
        onSuccess={onProductAdded}
        onCancel={onCancelAddProduct}
      />
    );
  }

  return (
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
        <Alert variant={showAddProductForm ? 'default' : 'destructive'}>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{barcodeError}</AlertDescription>
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
          <AlertDescription>
            <div className="space-y-3">
              <div className="whitespace-pre-line">{cameraError}</div>
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
          <AlertDescription>
            <div className="text-left">
              <div>
                <strong>Product Found:</strong> {productFound.name}
              </div>
              {productFound.brand && (
                <div>
                  <strong>Brand:</strong> {productFound.brand}
                </div>
              )}
              {productFound.quantity && (
                <div>
                  <strong>Quantity:</strong> {productFound.quantity}
                </div>
              )}
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
            onClick={onRequestCameraPermission}
            disabled={isLoadingProduct}
            className="mx-auto flex items-center gap-2"
          >
            <Camera className="h-4 w-4" />
            Start Camera
          </Button>
          {!canUseCamera && (
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

          <div className="flex items-center justify-center gap-3">
            <Button onClick={onStopCamera} variant="outline" disabled={isLoadingProduct}>
              Cancel
            </Button>
            <Button onClick={onStartCamera} disabled={isLoadingProduct}>
              Rescan
            </Button>
          </div>
        </div>
      )}

      {ingredients && activeTab === 'barcode' && !showAddProductForm && (
        <div className="mt-4 text-left">
          <label className="block mb-2">Product Ingredients:</label>
          <Textarea
            value={ingredients}
            onChange={(event) => onIngredientsChange(event.target.value)}
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
  );
}
