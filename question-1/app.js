import express from 'express';
import cors from "cors";
import axios from "axios";
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

const productCategories = ["Phone", "Computer", "TV", "Earphone", "Tablet", "Charger", "Mouse", "Keypad", "Bluetooth", "Pendrive", "Remote", "Speaker", "Headset", "Laptop", "PC"];
const productCompanies = ["AMZ", "FLP", "SNP", "MYN", "AZO"];
let requestsCount = 0; // Counter for tracking requests

const updateProductsFromCompanyAPI = async (company, category) => {
    try {
        const response = await axios.get(`http://20.244.56.144/test/companies/${company}/categories/${category}/products?top=10&minPrice=1&maxPrice=10000`, {
            headers: {"Authorization":`Bearer ${process.env.TOKEN}`}
        });
        const products = response.data.map(product => ({
            ...product,
            productId: uuidv4(), // Generate UUID for productId
            company: company, // Include company field
            category: category
        }));
        for (const product of products) {
            await prisma.product.upsert({
                where: { productId: product.productId },
                update: product,
                create: product,
            });
        }
    } catch (error) {
        console.error(`Error updating products from ${company} API for category ${category}:`, error);
    }
};


const getProductsFromDB = async (category, n, page, sortBy, sortOrder) => {
    let products = [];
    if (sortBy && sortOrder) {
        products = await prisma.product.findMany({
            where: { category },
            orderBy: { [sortBy]: sortOrder },
            take: +n,
            skip: page ? (+page - 1) * +n : 0,
        });
    } else {
        products = await prisma.product.findMany({
            where: { category },
            take: +n,
            skip: page ? (+page - 1) * +n : 0,
        });
    }
    return products;
};

app.get("/categories/:categoryName/products", async (req, res) => {
    const { categoryName } = req.params;
    const { n, page, sortBy, sortOrder } = req.query;

    // Check if the requested category is valid
    if (!productCategories.includes(categoryName)) {
        return res.status(400).json({ error: "Invalid category" });
    }

    // Update products from company API every 5 requests
    if (requestsCount === 0) {
        // Check if there are no products in the database for the given category
        const existingProducts = await prisma.product.findMany({
            where: { category: categoryName },
        });

        // If no products exist, fetch from the company API and store in the database
        if (existingProducts.length === 0) {
            for (const company of productCompanies) {
                await updateProductsFromCompanyAPI(company, categoryName);
            }
        }
    }

    if (++requestsCount % 5 === 0) {
        for (const company of productCompanies) {
            await updateProductsFromCompanyAPI(company, categoryName);
        }
    }

    try {
        const products = await getProductsFromDB(categoryName, n, page, sortBy, sortOrder);
        res.json(products);
    } catch (error) {
        console.error("Error fetching products:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

app.get("/categories/:categoryName/products/:productId", async (req, res) => {
    const { categoryName, productId } = req.params;

    try {
        // Fetch the product details from the database based on the category name and product ID
        const product = await prisma.product.findUnique({
            where: {
                productId_category: {
                    productId: productId,
                    category: categoryName
                }
            }
        });

        // If product is not found, return 404 Not Found
        if (!product) {
            return res.status(404).json({ error: "Product not found" });
        }

        // If product is found, return the product details
        res.json(product);
    } catch (error) {
        console.error("Error fetching product details:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});



app.listen(3000, () => {
    console.log("Server is running on port 3000...");
});
