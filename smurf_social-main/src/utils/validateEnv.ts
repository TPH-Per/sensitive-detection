interface EnvConfig {
    firebase: {
        apiKey: string;
        authDomain: string;
        projectId: string;
        storageBucket: string;
        messagingSenderId: string;
        appId: string;
        measurementId?: string;
        databaseURL: string;
        vapidKey: string;
    };
    api: {
        provincesUrl: string;
    };
    zegocloud: {
        appId: number;
    };
}

interface ValidationResult {
    isValid: boolean;
    errors: string[];
    warnings: string[];
}

const requiredEnvVars = [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_STORAGE_BUCKET',
    'VITE_FIREBASE_MESSAGING_SENDER_ID',
    'VITE_FIREBASE_APP_ID',
    'VITE_FIREBASE_DATABASE_URL',
    'VITE_FIREBASE_VAPID_KEY',
    'VITE_PROVINCES_API_URL',
    'VITE_ZEGO_APP_ID',
] as const;

const optionalEnvVars = [
    'VITE_FIREBASE_MEASUREMENT_ID',
] as const;

export function validateEnvironment(): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    requiredEnvVars.forEach((varName) => {
        const value = import.meta.env[varName];

        if (!value || value.trim() === '') {
            errors.push(`Missing required environment variable: ${varName}`);
        } else if (value.includes('your_') || value.includes('_here')) {
            errors.push(`Environment variable ${varName} contains placeholder value`);
        }
    });

    optionalEnvVars.forEach((varName) => {
        const value = import.meta.env[varName];
        if (!value || value.trim() === '') {
            warnings.push(`Optional environment variable not set: ${varName}`);
        }
    });

    return {
        isValid: errors.length === 0,
        errors,
        warnings,
    };
}

export function getValidatedEnvConfig(): EnvConfig {
    const validation = validateEnvironment();

    if (!validation.isValid) {
        const errorMessage = [
            '[Environment Configuration Error]',
            '',
            'Missing or invalid environment variables:',
            ...validation.errors.map(err => `  - ${err}`),
            '',
            'Please check your .env file and ensure all required variables are set.',
            'See .env.example for reference.',
        ].join('\n');

        console.error(errorMessage);
        throw new Error('Invalid environment configuration');
    }

    if (validation.warnings.length > 0) {
        console.warn('Environment warnings:', validation.warnings);
    }

    return {
        firebase: {
            apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
            authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
            projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
            storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
            messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
            appId: import.meta.env.VITE_FIREBASE_APP_ID,
            measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
            databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
            vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
        },
        api: {
            provincesUrl: import.meta.env.VITE_PROVINCES_API_URL,
        },
        zegocloud: {
            appId: Number(import.meta.env.VITE_ZEGO_APP_ID),
        },
    };
}
