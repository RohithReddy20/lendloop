import type { Metadata } from "next";
import { Fraunces, Geist } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Providers } from "@/components/providers";
import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], axes: ["opsz"] });

export const metadata: Metadata = {
  title: "LendLoop · Borrow what you need. Lend what you don't.",
  description: "A neighborhood tool-lending board.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geist.variable} ${fraunces.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <ClerkProvider
          appearance={{ variables: { colorPrimary: "#2f6b4f", borderRadius: "0.6rem" } }}
          afterSignOutUrl="/"
        >
          <Providers>{children}</Providers>
        </ClerkProvider>
      </body>
    </html>
  );
}
