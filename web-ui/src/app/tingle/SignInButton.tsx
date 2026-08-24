"use client";

export function SignInButton({
  onClick,
  size = "md",
  block = false,
  children = "Sign in",
}: {
  onClick: () => void;
  size?: "md" | "lg";
  block?: boolean;
  children?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`tingle-cta ${size === "lg" ? "tingle-cta-lg" : ""} ${block ? "tingle-cta-block" : ""}`}
    >
      <span>{children}</span>
      <span aria-hidden="true">→</span>
    </button>
  );
}
