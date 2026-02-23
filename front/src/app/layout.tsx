// app/layout.tsx
import "./globals.css";
import { AuthProvider } from '@/context/AuthContext';

export const metadata = {
    title: "Ariadna Lab",
    description: "Управление приборами и экспериментами",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="ru">
        <body>
        <AuthProvider>
            {children}
        </AuthProvider>
        </body>
        </html>
    );
}