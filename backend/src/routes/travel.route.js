import { Router } from 'express';
import {
  createTrip,
  generatePlaces,
  selectPlaces,
  generateItinerary
} from '../controllers/travel.controller.js';
import { verifyJWT } from '../middlewares/auth.middleware.js';

const router = Router();

router.use(verifyJWT);

router.post('/create', createTrip);
router.get('/:tripId/places', generatePlaces);
router.put('/:tripId/select', selectPlaces);
router.get('/:tripId/itinerary', generateItinerary);

export default router;