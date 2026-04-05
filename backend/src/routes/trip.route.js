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
import { verifyJWT } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(verifyJWT);

router.get('/', getTravels);
router.get('/status/:status', getTravelsByStatus);
router.get('/:id', getTravelById);
router.get('/:id/itinerary', getTravelItinerary);

export default router;