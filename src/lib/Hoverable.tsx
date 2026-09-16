import { useState, type CSSProperties, type ElementType, type HTMLAttributes, type MouseEvent } from 'react';

interface HoverableProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  style: CSSProperties;
  hoverStyle: CSSProperties;
}

/** A div (or other element) that swaps in `hoverStyle` on top of `style` while hovered — mirrors the design's `style-hover` attribute. */
export function Hoverable({ as: Tag = 'div', style, hoverStyle, onMouseEnter, onMouseLeave, ...props }: HoverableProps) {
  const [hover, setHover] = useState(false);
  return (
    <Tag
      {...props}
      style={hover ? { ...style, ...hoverStyle } : style}
      onMouseEnter={(e: MouseEvent<HTMLElement>) => { setHover(true); onMouseEnter?.(e); }}
      onMouseLeave={(e: MouseEvent<HTMLElement>) => { setHover(false); onMouseLeave?.(e); }}
    />
  );
}
