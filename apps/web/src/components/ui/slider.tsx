'use client';

import { cn } from '@/lib/utils';
import { forwardRef } from 'react';

export interface SliderProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value?: number;
  onValueChange?: (v: number) => void;
}

const Slider = forwardRef<HTMLInputElement, SliderProps>(
  ({ className, value = 0, onValueChange, min = 0, max = 100, ...props }, ref) => (
    <input
      ref={ref}
      type="range"
      min={min}
      max={max}
      value={value}
      onChange={(e) => onValueChange?.(Number(e.target.value))}
      className={cn(
        'w-full h-2 appearance-none rounded-full bg-muted cursor-pointer',
        '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4',
        '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:cursor-pointer',
        '[&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:border-0',
        className,
      )}
      {...props}
    />
  ),
);

Slider.displayName = 'Slider';

export { Slider };
