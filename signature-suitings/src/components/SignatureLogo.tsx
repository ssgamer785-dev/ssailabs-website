import React from "react";
import logoImg from "../assets/images/regenerated_image_1786787799815.jpg";

interface SignatureLogoProps {
  className?: string;
  size?: number | string;
  showText?: boolean;
  lightMode?: boolean;
  iconOnly?: boolean;
  alt?: string;
}

export default function SignatureLogo({
  className = "",
  size = "100%",
  showText = false,
  lightMode = false,
  iconOnly = false,
  alt = "Signature Suitings Logo"
}: SignatureLogoProps) {
  const dimensionStyle = typeof size === "number" ? { width: `${size}px`, height: `${size}px` } : { width: size, height: size };

  if (iconOnly) {
    return (
      <img
        src={logoImg}
        alt={alt}
        className={`object-contain transition-transform duration-300 hover:scale-105 ${className}`}
        style={dimensionStyle}
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <img
        src={logoImg}
        alt={alt}
        className="object-contain rounded-2xl shadow-xl transition-transform duration-300 hover:scale-[1.02]"
        style={dimensionStyle}
        referrerPolicy="no-referrer"
      />

      {showText && (
        <div className="mt-3 flex flex-col items-center text-center">
          {/* Main Title SIGNATURE */}
          <h1 
            className="font-serif text-2xl font-black tracking-[0.25em] leading-none uppercase select-none"
            style={{ 
              background: "linear-gradient(135deg, #BF953F 0%, #FCF6BA 25%, #B38728 50%, #FBF5B7 75%, #AA771C 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            SIGNATURE
          </h1>

          {/* Subtitle —— SUITINGS —— */}
          <div className="flex items-center gap-3 w-full max-w-[220px] mt-1.5 justify-center">
            <span className="h-[1px] flex-1 bg-gradient-to-r from-transparent to-[#d4af37]/60" />
            <span className="text-[11px] uppercase tracking-[0.3em] font-serif font-bold text-[#d4af37] select-none">
              SUITINGS
            </span>
            <span className="h-[1px] flex-1 bg-gradient-to-l from-transparent to-[#d4af37]/60" />
          </div>

          {/* Subtext */}
          <p className="text-[8px] uppercase tracking-[0.25em] text-white/50 font-bold font-sans mt-2 select-none">
            TAILORED &bull; ELEGANT &bull; DISTINCTLY YOURS
          </p>
        </div>
      )}
    </div>
  );
}

