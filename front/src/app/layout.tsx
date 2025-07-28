// app/layout.tsx
import "./globals.css";
import { SchemaProvider } from '@/context/SchemaContext';

export const metadata = {
    title: "Postgres GUI",
    description: "Dynamic table editor",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
        <body>
        <SchemaProvider>
            {children}
        </SchemaProvider>
        </body>
        </html>
    );
}