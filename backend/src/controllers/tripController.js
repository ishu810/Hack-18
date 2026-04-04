// import { Trip } from "../models/trip.model.js";

// export const getTripHistory = async (req, res) => {
//   try {
//     console.log("Fetching trip history...");
//     const trips = await Trip.find({}).sort({ createdAt: -1 });

//     res.status(200).json({
//       success: true,
//       count: trips.length,
//       data: trips,
//     });
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       message: "Error fetching trip history",
//       error: error.message,
//     });
//   }
// };

import { Travel } from '../models/travel.model.js'; 

/**
 * @desc    Get all travels for a specific user
 * @route   GET /api/travels
 */
export const getTravels = async (req, res) => {
  try {
    const userId = req.user?.id; 

    // Find travels, sort by newest first, and use .lean() for faster read-only performance
    const travels = await Travel.find({  })
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      count: travels.length,
      data: travels
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get a single travel plan by ID
 * @route   GET /api/travels/:id
 */

export const getTravelById = async (req, res) => {
  try {
    // 1. Change findById to find()
    // 2. Map the 'user' field in your schema to the ID from params
    const travels = await Travel.find({ user: req.params.id });

    // Check if the array is empty
    if (!travels || travels.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'No travel plans found for this user' 
      });
    }

    // Return the array of travel plans
    res.status(200).json({ success: true, data: travels });
  } catch (error) {
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ success: false, message: 'Invalid User ID format' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get only the itinerary of a specific trip
 * @route   GET /api/travels/:id/itinerary
 */
export const getTravelItinerary = async (req, res) => {
  try {
    // .select('itinerary') ensures we only pull the itinerary field from the DB
    const travel = await Travel.findById(req.params.id).select('itinerary');

    if (!travel) {
      return res.status(404).json({ success: false, message: 'Travel plan not found' });
    }

    res.status(200).json({ success: true, data: travel.itinerary });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Filter travels by status (e.g., 'planning' vs 'itinerary_generated')
 * @route   GET /api/travels/status/:status
 */
export const getTravelsByStatus = async (req, res) => {
  try {
    const { status } = req.params;
    const travels = await Travel.find({ }).lean();

    res.status(200).json({ success: true, data: travels });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};