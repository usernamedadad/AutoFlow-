"use client";

import React, { useState } from "react";
import Image from "next/image";

interface LogoProps {
  size?: number;
  className?: string;
  onClick?: () => void;
}

export default function Logo({ size = 40, className = "", onClick }: LogoProps) {
  const [isWiggling, setIsWiggling] = useState(false);

  return (
    <>
      <div
        className={`inline-block cursor-pointer select-none ${className}`}
        onMouseEnter={() => setIsWiggling(true)}
        onMouseLeave={() => setIsWiggling(false)}
        onClick={() => {
          setIsWiggling(true);
          setTimeout(() => setIsWiggling(false), 800);
          if (onClick) {
            onClick();
          }
        }}
        style={{ width: size, height: size, position: "relative" }}
      >
        <Image
          src="/logo.png"
          alt="AutoFlow+ Logo"
          width={size}
          height={size}
          priority
          className="w-full h-full object-contain"
          style={{
            transform: isWiggling ? "rotate(-3deg) scale(1.08)" : "rotate(0deg) scale(1)",
            transition: "transform 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55)",
          }}
        />
      </div>
    </>
  );
}
