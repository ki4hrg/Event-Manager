"use client";

import { useState, type InputHTMLAttributes } from "react";

// A date field the parent holds in state, without the closing picker: a
// controlled <input type="date"> is re-written on every change, and stepping
// the picker's month (which changes the value) shuts it. This one stays
// uncontrolled while the user types or picks, and remounts only when the
// value changes from outside (e.g. cleared by another field).
export function DateInput({
  value,
  onChange,
  ...rest
}: { value: string; onChange: (value: string) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "defaultValue" | "onChange">) {
  const [own, setOwn] = useState(value);
  const [generation, setGeneration] = useState(0);
  if (value !== own) {
    setOwn(value);
    setGeneration((g) => g + 1);
  }
  return (
    <input
      key={generation}
      type="date"
      defaultValue={value}
      onChange={(e) => {
        setOwn(e.target.value);
        onChange(e.target.value);
      }}
      {...rest}
    />
  );
}
