"use client";

import React from "react";

interface HandDrawnPencilProps {
  className?: string;
  size?: number;
}

export function HandDrawnPencil({ className = "", size = 24 }: HandDrawnPencilProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          filter: "url(#pencil-rough)",
        }}
      />
      <defs>
        <filter id="pencil-rough">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="0.5" />
        </filter>
      </defs>
    </svg>
  );
}

interface HandDrawnStarProps {
  className?: string;
  size?: number;
}

export function HandDrawnStar({ className = "", size = 24 }: HandDrawnStarProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        style={{
          filter: "url(#star-rough)",
        }}
      />
      <defs>
        <filter id="star-rough">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="1" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="0.4" />
        </filter>
      </defs>
    </svg>
  );
}
