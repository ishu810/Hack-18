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
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized request' });
    }

    const travels = await Travel.find({ user: userId })
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
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized request' });
    }

    const travel = await Travel.findOne({ _id: req.params.id, user: userId }).lean();

    if (!travel) {
      return res.status(404).json({ 
        success: false, 
        message: 'Travel plan not found' 
      });
    }

    res.status(200).json({ success: true, data: travel });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid travel ID format' });
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
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized request' });
    }

    const travel = await Travel.findOne({ _id: req.params.id, user: userId })
      .select('itinerary')
      .lean();

    if (!travel) {
      return res.status(404).json({ success: false, message: 'Travel plan not found' });
    }

    res.status(200).json({ success: true, data: travel.itinerary });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid travel ID format' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Filter travels by status (e.g., 'planning' vs 'itinerary_generated')
 * @route   GET /api/travels/status/:status
 */
export const getTravelsByStatus = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized request' });
    }

    const { status } = req.params;
    const allowedStatus = ['planning', 'places_generated', 'places_selected', 'itinerary_generated'];
    if (!allowedStatus.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Allowed: ${allowedStatus.join(', ')}`
      });
    }

    const travels = await Travel.find({ user: userId, status })
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({ success: true, data: travels });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};