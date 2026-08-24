import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tingle",
  description:
    "A watch on the claim you are actually building. Confirm one sentence, look at the public web, then watch what moved.",
};

export default function TingleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
