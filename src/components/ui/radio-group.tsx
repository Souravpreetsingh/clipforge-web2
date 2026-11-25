"use client";

import React from "react";

export function RadioGroup({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div role="radiogroup" className={`grid gap-2 ${className}`} {...props} />;
}

export function RadioGroupItem({ className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="radio"
      className={`h-4 w-4 accent-primary ${className}`}
      {...props}
    />
  );
}
