import React from 'react';

interface AuthBrandingPanelProps {
    headline: React.ReactNode;
    subtext: string;
}

export const AuthBrandingPanel: React.FC<AuthBrandingPanelProps> = ({ headline, subtext }) => (
    <div className="hidden lg:flex lg:w-1/2 flex-col p-12 relative overflow-hidden bg-primary">
        {/* Subtle Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary to-primary-dark transition-theme" />
        <div className="absolute inset-0 bg-black/5 mix-blend-overlay" />

        {/* Soft Ambient Light */}
        <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-white/5 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-white/5 rounded-full blur-[100px] pointer-events-none" />

        {/* Very subtle Dot texture */}
        <div
            className="absolute inset-0 pointer-events-none opacity-[0.02]"
            style={{
                backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)',
                backgroundSize: '24px 24px',
            }}
        />

        {/* Logo */}
        <div className="relative z-10 mb-auto">
            <img src="/logo_text_white.png" alt="Smurfy" className="h-11 object-contain" />
        </div>

        {/* Headline */}
        <div className="relative z-10 flex-1 flex flex-col justify-center space-y-5 py-20">
            <h2 className="text-5xl xl:text-6xl font-bold text-white leading-[1.1] tracking-tight">
                {headline}
            </h2>
            <p className="text-white/75 text-lg font-medium max-w-sm leading-relaxed">
                {subtext}
            </p>

            {/* Feature pills */}
            <div className="flex flex-wrap gap-2 pt-2">
                {['Kết nối bạn bè', 'Chia sẻ cảm xúc', 'Khám phá cộng đồng'].map((feat) => (
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
        <div className="relative z-10 mt-auto text-white/50 text-sm font-medium">
            © {new Date().getFullYear()} Smurfy Social.
        </div>
    </div>
);
