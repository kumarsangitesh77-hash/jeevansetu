import mongoose from 'mongoose';
import config from './config.js';

export async function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.warn('⚠️ No MONGO_URI found in environment. Skipping MongoDB connection.');
    return;
  }

  try {
    await mongoose.connect(uri);
    console.log('✅ Successfully connected to MongoDB!');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    process.exit(1);
  }
}

export default connectDB;
