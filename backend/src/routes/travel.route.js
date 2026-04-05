import { Router } from 'express';
import {
  createTrip,
  generatePlaces,
  selectPlaces,
  generateItinerary,
  computeRoute,
  getFlightCost,
  getTransportCost,
  estimateBudget,
} from '../controllers/travel.controller.js';
import { verifyJWT } from '../middlewares/auth.middleware.js';

const router = Router();

router.use(verifyJWT);

router.post('/create', createTrip);
router.post('/route/compute', computeRoute);
router.post('/flight-cost', getFlightCost);
router.post('/transport-cost', getTransportCost);
router.get('/:tripId/budget', estimateBudget);
router.post('/:tripId/budget', estimateBudget);
router.get('/:tripId/places', generatePlaces);
router.put('/:tripId/select', selectPlaces);
router.get('/:tripId/itinerary', generateItinerary);

export default router;