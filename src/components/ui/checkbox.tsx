"use client";

import React from "react";

export function Checkbox({ className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input type="checkbox" className={`h-4 w-4 accent-primary ${className}`} {...props} />;
}
