import express from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/user.model.js';
import { googleLogin, loginUser } from '../controllers/auth.controller.js';
import { registerUser } from '../controllers/user.controller.js';

const router = express.Router();

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
};

router.post('/login', loginUser);
router.post('/register', registerUser);

// Existing idToken-based Google login endpoint
router.post('/google', googleLogin);

// OAuth redirect flow
router.get('/google', (req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: process.env.GOOGLE_CALLBACK_URL,
    response_type: 'code',
    scope: 'openid email profile',
    prompt: 'select_account',
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

router.get('/google/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.redirect('/login?error=no_code');
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: process.env.GOOGLE_CALLBACK_URL,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      throw new Error('No access token from Google');
    }

    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = await profileRes.json();

    if (!profile.email) {
      throw new Error('No email returned from Google');
    }

    let user = await User.findOne({ googleId: profile.id });

    if (!user) {
      user = await User.findOne({ email: profile.email });

      if (user) {
        user.googleId = profile.id;
        user.provider = 'google';
        user.avatar = user.avatar || profile.picture;
        await user.save();
      } else {
        const baseUsername = profile.email
          .split('@')[0]
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '');
        const username = `${baseUsername}_${Math.random().toString(36).slice(2, 7)}`;

        user = await User.create({
          googleId: profile.id,
          email: profile.email,
          fullname: profile.name || baseUsername,
          username,
          avatar: profile.picture,
          provider: 'google',
          role: 'ranger',
        });
      }
    }

    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    const clientUrl = process.env.CLIENT_URL || process.env.CORS_ORIGIN || 'http://localhost:5173';

    return res
      .cookie('accessToken', accessToken, { ...cookieOptions, maxAge: 15 * 60 * 1000 })
      .cookie('refreshToken', refreshToken, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 })
      .redirect(`${clientUrl}/agent-home`);
  } catch (err) {
    console.error('Google OAuth error:', err.message);
    return res.redirect('/login?error=google_failed');
  }
});

router.get('/me', async (req, res) => {
  const token = req.cookies?.accessToken;
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    const user = await User.findById(decoded._id).select('-password -refreshToken');
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    return res.json({ user });
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
});

router.post('/logout', async (req, res) => {
  const token = req.cookies?.accessToken;

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
      await User.findByIdAndUpdate(decoded._id, { $unset: { refreshToken: 1 } });
    } catch {
      // ignore token errors during logout
    }
  }

  return res
    .clearCookie('accessToken', cookieOptions)
    .clearCookie('refreshToken', cookieOptions)
    .json({ message: 'Logged out successfully' });
});

export default router;
