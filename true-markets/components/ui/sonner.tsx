"use client";

import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      position="top-center"
      toastOptions={{
        style: {
          border: "1px solid rgba(255,255,255,0.14)",
          background: "#0b0b0b",
          color: "#f4f4f5",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
