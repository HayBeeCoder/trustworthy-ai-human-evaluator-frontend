import "./globals.css";
import React from "react";

export const metadata = {
    title: "Prediction Review Studio",
    description: "MVP annotation app for multimodal prediction verification"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body>
                <div className="app-shell">
                    <div className="app-content">{children}</div>
                    <footer className="app-footer">
                        <p>Every image shown is from the Dollar Street dataset.</p>
                        <p>
                            Disclaimer: Any close resemblance or similarity of any image content to users/evaluators is
                            purely coincidental.
                        </p>
                      
                      
                    </footer>
                </div>
            </body>
        </html>
    );
}
