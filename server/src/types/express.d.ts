import 'express';

declare global {
  namespace Express {
    interface Request {
      userId?: number;
      storeId?: number | null;
      deviceId?: string | null;
      user?: {
        userId: number;
        storeId: number | null;
        deviceId: string | null;
        role: string;
      };
    }
  }
}
