const express = require('express');
const validate = require('../../middlewares/validate');
const authValidation = require('../../validations/auth.validation');
const authController = require('../../controllers/auth.controller');
const accountController = require('../../controllers/account.controller');
const auth = require('../../middlewares/auth');

const router = express.Router();
router.post('/register', validate.validate(authValidation.register), authController.register);
router.post('/register-employee', validate.validate(authValidation.registerEmployee), authController.registerEmployee);
router.get('/profile', auth(), authController.getProfile);
router.post('/login', authController.login);
router.post('/logout', validate.validate(authValidation.logout), authController.logout);
router.post('/refresh-tokens', validate.validate(authValidation.refreshTokens), authController.refreshTokens);
router.post('/forgot-password', validate.validate(authValidation.forgotPassword), authController.forgotPassword);
router.post('/reset-password', validate.validate(authValidation.resetPassword), authController.resetPassword);
router.post('/send-verification-email', auth(), authController.sendVerificationEmail);
router.post('/verify-email', validate.validate(authValidation.verifyEmail), authController.verifyEmail);
router.route('/checkOtp').post(accountController.OTPCheck, authController.login);
router.route('/otp').post(accountController.OTPRequest);
router.route('/notifications').get(auth(), accountController.ReadNotifications);
router.route('/change-pass').post(auth(), accountController.OTPCheck, accountController.UpdatePassword);
module.exports = router;
