import jsonwebtoken from 'jsonwebtoken';

interface DecodedToken {
    sub: string | number;
    companyId:string | number;
    access:string|number;
    iat?: number;
    exp?: number;
}

const getTokenData = (token:string | any): Record<any,any> => {

    if (!token) {

        return {status:false,message:"Token not provided"};
    }

    try {
        // Verify the token
        const decoded = jsonwebtoken.verify(token, process.env.JWT_KEY as string) as DecodedToken;
        
        if (!decoded) {

            return {status:false, message :"Invald token structure"};
        }
        
        // console.log("decoded =>",decoded);
        return {status:true,companyId:decoded.companyId};
    } catch (err: any) {
        console.error('An error occurred while verifying JWT:', err);

        if (err.name === 'JsonWebTokenError') {
            return { message: 'Invalid token, unauthorized.', status: false };

        } else if (err.name === 'TokenExpiredError') {
            return {message: 'Token expired, please login again.', status: false };
        }

        return {message: 'Could not verify token, try again.', status: false };
    }
};

export default getTokenData;
