import jsonwebtoken from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

interface DecodedToken {
    sub: string | number;
    companyId:string | number;
    access:string|number;
    name?: string;      
    username?: string;
    iat?: number;
    exp?: number;
}

const verifyJWT = (req: Request, res: Response, next: NextFunction): void => {
    // Extract token from the Authorization header
    const authHeader = req.headers['authorization'];
    const token: string | null = authHeader?.split('Bearer')[1].trim() || null;

    if (!token) {
        res.status(401).json({ message: 'No token provided, unauthorized.', status: false });

        return;
    }

    try {
        // Verify the token
        const decoded = jsonwebtoken.verify(token, process.env.JWT_KEY as string) as DecodedToken;
        
        if (!decoded) {
            res.status(401).json({ message: 'Invalid token structure.', status: false });
            return;
        }
        
        // console.log("decoded =>",decoded);
        (req as any).user = decoded;
        req.body ||= {};
        req.body.userId = decoded.sub;
        req.body.companyId = decoded.companyId;
        next();
    } catch (err: any) {
        console.error('An error occurred while verifying JWT:', err);

        if (err.name === 'JsonWebTokenError') {
            res.status(401).json({ message: 'Invalid token, unauthorized.', status: false });

            return;
        } else if (err.name === 'TokenExpiredError') {
            res.status(401).json({ message: 'Token expired, please login again.', status: false });
            return;
        }

        res.status(500).json({ message: 'Could not verify token, try again.', status: false });
        return;
    }
};

export default verifyJWT;
