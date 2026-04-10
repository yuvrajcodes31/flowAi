import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { clerkMiddleware, requireAuth } from '@clerk/express';
import aiRouter from './routes/aiRoutes.js';
import connectCloudinary from './configs/cloudinary.js';
import userRouter from './routes/userRoutes.js';

const app = express()



app.use(cors())
app.use(express.json())
app.use(clerkMiddleware())


// await connectCloudinary();

app.use(async (req, res, next) => {
    try {
        connectCloudinary()
    } catch (error) {
        console.error('Cloudinary init failed:', err.message);
    }
    next();
});
app.use("/api/status", (req, res) => res.send("Server is live"))
app.use('/api/ai', requireAuth(), aiRouter)
app.use('/api/user', requireAuth(), userRouter)

// const port = process.env.PORT || 5000;
// app.listen(port, () => console.log("Server is running on PORT:", port))

if (process.env.NODE_ENV !== "production") {
    const port = process.env.PORT || 5000;
    app.listen(port, () => console.log("Server is running on PORT:", port))
}
// export server for vercel
export default app