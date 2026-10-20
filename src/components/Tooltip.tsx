'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
  text: string;
  className?: string;
}

export function Tooltip({ text, className = '' }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    placement: 'top' | 'bottom';
    arrowLeft: number;
  }>({
    top: 0,
    left: 0,
    placement: 'top',
    arrowLeft: 0,
  });

  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const calculatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const tooltipWidth = Math.min(290, window.innerWidth - 32);
    const tooltipEstimatedHeight = 80;
    const spacing = 8;

    // Determine placement: prefer top unless near top of viewport
    const spaceAbove = rect.top;
    const placement = spaceAbove < tooltipEstimatedHeight + spacing + 15 ? 'bottom' : 'top';

    // Calculate vertical top
    let top = 0;
    if (placement === 'top') {
      top = rect.top - spacing;
    } else {
      top = rect.bottom + spacing;
    }

    // Calculate horizontal center
    const triggerCenterX = rect.left + rect.width / 2;
    let left = triggerCenterX - tooltipWidth / 2;

    // Viewport clamping (16px margins from screen edges)
    const minLeft = 16;
    const maxLeft = window.innerWidth - tooltipWidth - 16;
    if (left < minLeft) left = minLeft;
    if (left > maxLeft) left = maxLeft;

    // Calculate arrow position relative to tooltip box
    const arrowLeft = Math.max(12, Math.min(tooltipWidth - 12, triggerCenterX - left));

    setCoords({
      top,
      left,
      placement,
      arrowLeft,
    });
  }, []);

  const handleMouseEnter = () => {
    calculatePosition();
    setVisible(true);
  };

  const handleMouseLeave = () => {
    setVisible(false);
  };

  // Update position on scroll / resize if visible
  useEffect(() => {
    if (!visible) return;
    function handleUpdate() {
      calculatePosition();
    }
    window.addEventListener('scroll', handleUpdate, { passive: true });
    window.addEventListener('resize', handleUpdate, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleUpdate);
      window.removeEventListener('resize', handleUpdate);
    };
  }, [visible, calculatePosition]);

  if (!text) return null;

  return (
    <span
      className={`tooltip-container ${className}`}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        verticalAlign: 'middle',
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className={`tooltip-trigger ${visible ? 'tooltip-trigger--active' : ''}`}
        aria-label="More information"
        tabIndex={0}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={handleMouseEnter}
        onBlur={handleMouseLeave}
        onClick={(e) => {
          // Prevent card navigation when tapping ? on touch devices
          e.stopPropagation();
          e.preventDefault();
          calculatePosition();
          setVisible(!visible);
        }}
        onTouchEnd={(e) => {
          e.stopPropagation();
        }}
      >
        ?
      </button>

      {visible && mounted && createPortal(
        <div
          className={`tooltip-portal-popup tooltip-portal-popup--${coords.placement}`}
          style={{
            position: 'fixed',
            top: coords.placement === 'top' ? 'auto' : `${coords.top}px`,
            bottom: coords.placement === 'top' ? `${window.innerHeight - coords.top}px` : 'auto',
            left: `${coords.left}px`,
            width: `${Math.min(290, typeof window !== 'undefined' ? window.innerWidth - 32 : 290)}px`,
            zIndex: 999999,
            pointerEvents: 'none',
          }}
        >
          <div className="tooltip-portal-popup__content">
            <div className="tooltip-portal-popup__text">{text}</div>
          </div>
          <div
            className={`tooltip-portal-arrow tooltip-portal-arrow--${coords.placement}`}
            style={{ left: `${coords.arrowLeft}px` }}
          />
        </div>,
        document.body
      )}
    </span>
  );
}
