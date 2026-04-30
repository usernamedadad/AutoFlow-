'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { FlowDirection } from '@/lib/projectApi';

interface DirectionSelectorProps {
  direction: FlowDirection;
  onChange: (direction: FlowDirection) => void;
  className?: string;
}

const DirectionSelector: React.FC<DirectionSelectorProps> = ({ 
  direction, 
  onChange, 
  className = '' 
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const directions: { value: FlowDirection; label: string; description: string }[] = [
    { value: 'TD', label: '从上到下', description: 'Top to Down' },
    { value: 'LR', label: '从左到右', description: 'Left to Right' },
  ];

  const toggleDropdown = () => {
    setIsOpen(!isOpen);
  };

  const handleDirectionSelect = (selectedDirection: FlowDirection) => {
    onChange(selectedDirection);
    setIsOpen(false);
  };

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={toggleDropdown}
        className="flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-[#e5e2dd] dark:border-[#3f3d39] bg-white dark:bg-[#262524] text-[#5c5c5c] dark:text-[#c8c4bc] hover:border-[#93c5fd] transition-all cursor-pointer font-semibold text-sm"
        style={{ fontFamily: "'Comic Sans MS', cursive, sans-serif" }}
      >
        <span>{directions.find(d => d.value === direction)?.label}</span>
        {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-full bg-white dark:bg-[#262524] border-2 border-[#e5e2dd] dark:border-[#3f3d39] rounded-lg shadow-lg z-50">
          {directions.map((item) => (
            <button
              key={item.value}
              onClick={() => handleDirectionSelect(item.value)}
              className={`w-full text-left px-4 py-2 hover:bg-[#f1f5f9] dark:hover:bg-[#3f3d39] transition-colors ${direction === item.value ? 'bg-[#bfdbfe] dark:bg-[#1e3a8a] text-[#1e40af] dark:text-[#93c5fd]' : 'text-[#5c5c5c] dark:text-[#c8c4bc]'}`}
              style={{ fontFamily: "'Comic Sans MS', cursive, sans-serif" }}
            >
              <div className="flex items-center justify-between">
                <span>{item.label}</span>
                <span className="text-xs opacity-70">{item.description}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default DirectionSelector;