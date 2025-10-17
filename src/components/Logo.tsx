import { Leaf } from 'lucide-react';

interface LogoProps {
  size?: 'sm' | 'md';
}

export function Logo({ size = 'md' }: LogoProps) {
  const iconWrapperClasses =
    size === 'sm'
      ? 'h-8 w-8'
      : 'h-10 w-10';
  const iconSize = size === 'sm' ? 20 : 24;

  return (
    <div className="flex items-center gap-3">
      <div className={`bg-green-100 rounded-full flex items-center justify-center ${iconWrapperClasses}`}>
        <Leaf className="text-green-600" style={{ height: iconSize, width: iconSize }} />
      </div>
      <div>
        <span className="block text-2xl font-semibold text-foreground">CleanEats</span>
        <span className="block text-sm text-muted-foreground">Know what you eat</span>
      </div>
    </div>
  );
}
