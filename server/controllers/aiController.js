import { GoogleGenAI } from "@google/genai";
import sql from "../configs/db.js";
import { clerkClient } from "@clerk/express";
import fs from 'fs';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import axios from 'axios';
import { v2 as cloudinary } from 'cloudinary'
import { buffer } from "node:stream/consumers";

// The client gets the API key from the environment variable `GEMINI_API_KEY`.
const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

async function main() {

}

export const generateArticle = async (req, res) => {
    try {
        const { userId } = req.auth();
        const { prompt, length } = req.body;
        const plan = req.plan;
        const free_usage = req.free_usage;

        if (plan !== 'premium' && free_usage >= 10) {
            return res.json({ success: false, message: "Limit reached. Upgrade to premium." })
        }

        const response = await ai.models.generateContent({
            model: "gemini-3.1-flash-lite-preview",
            contents: prompt,
            config: {
                maxOutputTokens: length,
                temperature: 0.7
            }
        });
        const content = response.text

        await sql` INSERT INTO creations (user_id, prompt, content, type)
        VALUES (${userId}, ${prompt}, ${content}, 'article')`;

        if (plan !== 'premium') {
            await clerkClient.users.updateUserMetadata(userId, {
                privateMetadata: {
                    free_usage: free_usage + 1
                }
            })
        }

        res.json({ success: true, content })

    } catch (error) {
        console.log(error.message)
        res.json({ success: false, message: error.message })
    }
}


export const generateBlogTitle = async (req, res) => {
    try {
        const { userId } = req.auth();
        const { prompt } = req.body;
        const plan = req.plan;
        const free_usage = req.free_usage;

        if (plan !== 'premium' && free_usage >= 10) {
            return res.json({ success: false, message: "Limit reached. Upgrade to premium." })
        }

        const response = await ai.models.generateContent({
            model: "gemini-3.1-flash-lite-preview",
            contents: prompt,
            config: {
                temperature: 0.7
            }
        });
        const content = response.text

        await sql` INSERT INTO creations (user_id, prompt, content, type)
        VALUES (${userId}, ${prompt}, ${content}, 'blog-title')`;

        if (plan !== 'premium') {
            await clerkClient.users.updateUserMetadata(userId, {
                privateMetadata: {
                    free_usage: free_usage + 1
                }
            })
        }

        res.json({ success: true, content })

    } catch (error) {
        console.log(error.message)
        res.json({ success: false, message: error.message })
    }
}


export const generateImage = async (req, res) => {
    try {
        const { userId } = req.auth();
        const { prompt, publish } = req.body;
        const plan = req.plan;

        if (plan !== 'premium') {
            return res.json({ success: false, message: "This feature is only available for premium subscriptions." })
        }

        const formData = new FormData();
        formData.append('prompt', prompt)
        
        let base64Image;

        await fetch('https://clipdrop-api.co/text-to-image/v1', {
            method: 'POST',
            headers: {
                'x-api-key': process.env.CLIPDROP_API_KEY,
            },
            body: formData,
        })
            .then(response => response.arrayBuffer())
            .then(buffer => {
                base64Image = `data:image/png;base64,${Buffer.from(buffer).toString('base64')}`
            })

        

        const { secure_url } = await cloudinary.uploader.upload(base64Image)

        await sql` INSERT INTO creations (user_id, prompt, content, type, publish)
        VALUES (${userId}, ${prompt}, ${secure_url}, 'image', ${publish ?? false})`;



        res.json({ success: true, content: secure_url })

    } catch (error) {
        console.log(error.message)
        res.json({ success: false, message: error.message })
    }
}


export const removeImageBackground = async (req, res) => {
    try {
        const { userId } = req.auth();
        const image  = req.file;
        const plan = req.plan;

        if (plan !== 'premium') {
            return res.json({ success: false, message: "This feature is only available for premium subscriptions." })
        }

        

        const { secure_url } = await cloudinary.uploader.upload(image.path, {
            transformation: [
                {
                    effect: 'background_removal',
                    background_removal: 'remove_the_background'
                }
            ]
        })

        await sql` INSERT INTO creations (user_id, prompt, content, type)
        VALUES (${userId}, 'Remove background from image', ${secure_url}, 'image')`

        res.json({ success: true, content: secure_url })

    } catch (error) {
        console.log(error.message)
        res.json({ success: false, message: error.message })
    }
}


export const removeImageObject = async (req, res) => {
    try {
        const { userId } = req.auth();
        const { object } = req.body
        const image  = req.file;
        const plan = req.plan;


        if (plan !== 'premium') {
            return res.json({ success: false, message: "This feature is only available for premium subscriptions." })
        }

        const { public_id } = await cloudinary.uploader.upload(image.path)

        const imageUrl = cloudinary.url(public_id, {
            transformation: [{effect: `gen_remove:${object}`}],
            resource_type: 'image'
        })

        await sql` INSERT INTO creations (user_id, prompt, content, type)
        VALUES (${userId}, ${`Removed ${object} from image`}, ${imageUrl}, 'image')`;


        console.log("Plan ", req.plan)
        console.log("free usage ", req.free_usage)

        res.json({ success: true, content: imageUrl })

    } catch (error) {
        console.log(error.message)
        res.json({ success: false, message: error.message })
    }
}
export const resumeReview = async (req, res) => {
    try {
        const { userId } = req.auth();
        const resume = req.file;
        const plan = req.plan;


        if (plan !== 'premium') {
            return res.json({ success: false, message: "This feature is only available for premium subscriptions." })
        }

        if(resume.size > 5 * 1024 * 1024){
            return res.json({success: false, message: "resume file size exceeds allowed size (5MB)."})
        }

        const dataBuffer = fs.readFileSync(resume.path)
        const pdfData = await pdfParse(dataBuffer);

        const prompt = `Review the following resume and provide constructive feedback on its strengths, weakness, and area for improvement. Resume Content: ${pdfData.text}`

        const response = await ai.models.generateContent({
            model: "gemini-3.1-flash-lite-preview",
            contents: prompt,
            config: {
                temperature: 0.7
            }
        });
        const content = response.text


        await sql` INSERT INTO creations (user_id, prompt, content, type)
        VALUES (${userId}, 'Review the uploaded resume', ${content}, 'resume-review')`;


        res.json({ success: true, content })

    } catch (error) {
        console.log(error.message)
        res.json({ success: false, message: error.message })
    }
}

