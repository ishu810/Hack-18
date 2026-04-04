// import express from 'express';
// import { getTripHistory } from '../controllers/tripController.js';
// // import { protect } from '../middleware/authMiddleware.js'; // Ensure this exists

// const router = express.Router();

// router.get('/history', getTripHistory);

// export default router;

import express from 'express';
import { 
  getTravels, 
  getTravelById, 
  getTravelItinerary, 
  getTravelsByStatus 
} from '../controllers/tripController.js';

const router = express.Router();

router.get('/', getTravels);
router.get('/:id', getTravelById);
router.get('/:id/itinerary', getTravelItinerary);
router.get('/status/:status', getTravelsByStatus);

export default router;