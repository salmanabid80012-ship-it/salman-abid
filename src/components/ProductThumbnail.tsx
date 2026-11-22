import React, { useState } from 'react';
import { Package } from 'lucide-react';

interface ProductThumbnailProps {
  src?: string;
  alt: string;
  category: string;
  className?: string;
}

export const ProductThumbnail: React.FC<ProductThumbnailProps> = ({
  src,
  alt,
  category,
  className = 'h-12 w-16',
}) => {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={`${className} flex flex-col items-center justify-center rounded-md border border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 shrink-0 overflow-hidden`}
        title={category}
      >
        <Package className="h-4 w-4" aria-hidden="true" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${className} rounded-md border border-slate-200 object-cover dark:border-slate-700 shrink-0`}
    />
  );
};
