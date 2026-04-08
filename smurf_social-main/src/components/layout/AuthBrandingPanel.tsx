import React from 'react';

interface AuthBrandingPanelProps {
    headline: React.ReactNode;
    subtext: string;
}

export const AuthBrandingPanel: React.FC<AuthBrandingPanelProps> = ({ headline, subtext }) => (
    <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 relative overflow-hidden bg-primary">
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-black/20 mix-blend-overlay" />

        {/* Ambient glows */}
        <div className="absolute top-[-15%] right-[-10%] w-[500px] h-[500px] bg-white/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-10%] left-[-8%] w-[400px] h-[400px] bg-black/15 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-white/5 rounded-full blur-[150px] pointer-events-none" />

        {/* Dot texture */}
        <div
            className="absolute inset-0 pointer-events-none opacity-[0.04]"
            style={{
                backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)',
                backgroundSize: '28px 28px',
            }}
        />

        {/* Logo */}
        <div className="relative z-10">
            <img src="/logo_text_white.png" alt="Smurfy" className="h-11 object-contain" />
        </div>

        {/* Headline */}
        <div className="relative z-10 space-y-5">
            <h2 className="text-5xl xl:text-6xl font-bold text-white leading-[1.1] tracking-tight">
                {headline}
            </h2>
            <p className="text-white/75 text-lg font-medium max-w-sm leading-relaxed">
                {subtext}
            </p>

            {/* Feature pills */}
            <div className="flex flex-wrap gap-2 pt-2">
                {['Nhắn tin tức thì', 'Gọi video HD', 'Chia sẻ khoảnh khắc'].map((feat) => (
                    <span
                        key={feat}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/15 border border-white/20 text-white/90 text-xs font-medium backdrop-blur-sm"
                    >
                        <span className="w-1.5 h-1.5 rounded-full bg-white/80 flex-shrink-0" />
                        {feat}
                    </span>
                ))}
            </div>
        </div>

        {/* Footer */}
        <div className="relative z-10 text-white/50 text-sm font-medium">
            © {new Date().getFullYear()} Smurfy Social.
        </div>
    </div>
);
