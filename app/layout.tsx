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
                        <p>Image source: Dollar Street dataset.</p>
                        <p>
                            Disclaimer: Any resemblance or similarity of any image content to users/evaluators is
                            purely coincidental.
                        </p>
                        <p>
                            Annotation note: If a prediction shows <strong>abstention</strong>, interpret it as lack of
                            a clear prediction, empty/blank, or missing information.
                        </p>
                        <p>Copyright 2026</p>
                    </footer>
                </div>
            </body>
        </html>
    );
}
