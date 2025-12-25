export const msalConfig={

        auth: {
        clientId: process.env.OUTLOOK_CLIENT_ID || '',
        clientSecret: process.env.OUTLOOK_CLIENT_SECRET || '',
        authority: `https://login.microsoftonline.com/${process.env.OUTLOOK_TENANT_ID || 'common'}`, // 'common' for multi-tenant, or your specific tenant ID
        redirectUri:'https://cybernauts.online/alpha16/outlook/connect',
    },
    system: {
        loggerOptions: {
            loggerCallback(loglevel: any, message: string, containsPii: boolean) {
                console.log(message);
            },
            piiLoggingEnabled: false,
            logLevel: 3, // msal.LogLevel.Verbose
        }
    }

}


export const GRAPH_SCOPES = [
    "User.Read", 
    "Mail.Read",
    "Mail.Send",
    "offline_access" 
];
