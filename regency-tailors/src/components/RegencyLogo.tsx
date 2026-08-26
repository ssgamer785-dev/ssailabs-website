import React, { useState } from 'react';
import regencyLogoImg from '../assets/images/regency-tailors-logo.jpg';

export const OFFICIAL_REGENCY_LOGO = regencyLogoImg;

interface RegencyLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'custom';
  className?: string;
  alt?: string;
  style?: React.CSSProperties;
}

/**
 * Official Regency Tailors Brand Logo Component
 * Uses the exact official brand asset with needle-and-thread RP monogram,
 * REGENCY TAILORS typography, and gold flourishes.
 */
export const RegencyLogo: React.FC<RegencyLogoProps> = ({
  size = 'md',
  className = '',
  alt = 'Regency Tailors Official Logo',
  style
}) => {
  const [imgSrc, setImgSrc] = useState<string>(OFFICIAL_REGENCY_LOGO);
  const [hasError, setHasError] = useState(false);

  const sizeClasses = {
    xs: 'w-24 max-h-16',
    sm: 'w-32 max-h-20',
    md: 'w-44 max-h-28',
    lg: 'w-56 max-h-36',
    xl: 'w-72 max-h-48',
    custom: ''
  }[size];

  const handleImgError = () => {
    if (imgSrc !== '/regency-tailors-logo.jpg') {
      // Fallback to public root path
      setImgSrc('/regency-tailors-logo.jpg');
    } else {
      setHasError(true);
    }
  };

  if (hasError) {
    return (
      <div className={`flex items-center justify-center select-none ${className}`}>
        <div className="flex flex-col items-center justify-center text-center p-2 rounded-xl border border-[#C9A24A]/40 bg-[#071426]">
          <div className="w-10 h-10 rounded-full border border-[#C9A24A] flex items-center justify-center text-[#C9A24A] font-serif font-black text-lg mb-1">
            RT
          </div>
          <span className="text-xs font-extrabold tracking-widest text-[#D4AF5A] uppercase">REGENCY TAILORS</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center justify-center select-none ${className}`}>
      <img
        src={imgSrc}
        alt={alt}
        onError={handleImgError}
        referrerPolicy="no-referrer"
        className={`${sizeClasses} object-contain transition-transform duration-200`}
        style={{
          objectFit: 'contain',
          ...style
        }}
      />
    </div>
  );
};


