# T Social Monetization System - Complete Setup Guide

## Overview
This guide will help you set up the complete monetization system with AdSense/AdMob integration, PayPal payouts, and automated 70/30 revenue sharing.

---

## 1. Google AdSense Setup (For Web)

### Step 1: Create AdSense Account
1. Go to [Google AdSense](https://www.google.com/adsense)
2. Sign up with your Google account
3. Submit your website for review
4. Wait for approval (usually 1-3 days)

### Step 2: Get Your Publisher ID
1. Log in to AdSense dashboard
2. Go to **Account** → **Settings**
3. Copy your Publisher ID (format: `ca-pub-XXXXXXXXXXXXXXXX`)

### Step 3: Create Ad Units
1. Go to **Ads** → **Overview** → **By ad unit**
2. Click **+ New ad unit**
3. Create these ad units:
   - **Feed Banner** (Display ad - Responsive)
   - **Feed Native** (In-feed ad)
   - **Sidebar Banner** (Display ad - Responsive)
4. Copy each Ad Unit ID (format: `1234567890`)

### Step 4: Add AdSense Code to Your Website
Add this to your `index.html` file in the `<head>` section:

```html
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXXXXXXXXXXX"
     crossorigin="anonymous"></script>
```

Replace `ca-pub-XXXXXXXXXXXXXXXX` with your actual Publisher ID.

### Step 5: Configure in T Social
1. Go to **Admin Panel** → **Ad Configuration** (`/admin/ads`)
2. Click **+ Add Placement**
3. Fill in:
   - **Network**: Google AdSense (Web)
   - **Placement Type**: Banner/Native
   - **Ad Slot ID**: Your ad unit ID
   - **Location**: Choose where to display
4. Click **Add Placement**

---

## 2. Google AdMob Setup (For Mobile App)

### Step 1: Create AdMob Account
1. Go to [Google AdMob](https://admob.google.com)
2. Sign up and add your app
3. Get your **App ID** (format: `ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY`)

### Step 2: Create Ad Units
Create these ad units in AdMob:
- **Banner** (320x50)
- **Interstitial** (Full-screen)
- **Rewarded** (Full-screen with reward)
- **Native Advanced** (Custom design)

### Step 3: Integrate AdMob SDK
For mobile app deployment:
1. Add AdMob SDK to your Capacitor project
2. Initialize with your App ID
3. Add ad unit IDs to Ad Configuration page

---

## 3. PayPal Integration

### Step 1: PayPal Business Account (Platform Owner)
1. Go to [PayPal](https://www.paypal.com)
2. Create or upgrade to **Business Account**
3. Your account email: `nahashonnyaga794@gmail.com`
4. Verify your account (bank account + identity verification)

### Step 2: Enable PayPal Payouts API (Optional for Automation)
To enable **automatic** payouts:

1. Go to [PayPal Developer](https://developer.paypal.com)
2. Log in with your business account
3. Create a **REST API App**
4. Get your credentials:
   - **Client ID**
   - **Secret**
5. Enable **Payouts** permission

### Step 3: Configure API Keys (If Using Automation)
You'll need to create environment variables:

```env
PAYPAL_CLIENT_ID=your_client_id
PAYPAL_SECRET=your_secret
PAYPAL_MODE=live  # or 'sandbox' for testing
```

### Step 4: Configure in T Social
1. Go to **Admin Panel** → **Ad Configuration**
2. Under **Platform Settings**:
   - **Platform PayPal Email**: `nahashonnyaga794@gmail.com`
   - **Platform Revenue Share**: `70` (you keep 70%, users get 30%)
3. Click **Save Platform Settings**

---

## 4. User PayPal Setup

### For Content Creators:
1. Each user goes to **Payouts** page (`/payouts`)
2. Under **PayPal Configuration**:
   - Enter their PayPal email
   - Click **Save**
3. They can now request withdrawals

---

## 5. How Revenue Sharing Works

### Automatic 70/30 Split:
1. **User posts content** with ads displayed
2. **Ad generates revenue** (e.g., $10)
3. **System automatically splits**:
   - Platform (you): $7.00 (70%)
   - Content creator: $3.00 (30%)
4. **Platform share** goes to pending payout for `nahashonnyaga794@gmail.com`
5. **User share** goes to their wallet balance

### Example:
```
Total Ad Revenue: $100
├── Platform Share (70%): $70 → nahashonnyaga794@gmail.com
└── User Share (30%): $30 → User's PayPal account
```

---

## 6. Withdrawal Process

### For Users:
1. Go to **Payouts** page
2. Check **Available** balance
3. Enter withdrawal amount
4. Click **Request Withdrawal to PayPal**
5. Funds arrive in 2-5 business days

### For Platform Owner (You):
You have two options:

**Option A: Manual Payouts** (Simple)
1. Go to **Admin Panel** → **Payouts**
2. View pending platform payouts
3. Manually request transfer to your PayPal

**Option B: Automated Payouts** (Advanced)
Requires PayPal Payouts API setup:
1. Configure PayPal API credentials
2. System automatically sends payouts weekly/monthly
3. You receive 70% share directly to `nahashonnyaga794@gmail.com`

---

## 7. Verification Payment System

When users apply for profile verification:

### Payment Flow:
1. **User applies** for verification (e.g., $50 fee)
2. **System checks**:
   - Monetization earnings ≥ $50? → Deduct from earnings
   - Wallet balance ≥ $50? → Deduct from wallet
   - Insufficient? → Request PayPal deposit
3. **Verification fee** goes to `nahashonnyaga794@gmail.com`

---

## 8. Minimum Requirements for User Monetization

Users must meet these criteria (set in `user_monetization.eligibility_status`):

- ✅ **1,000+ followers**
- ✅ **100,000+ total post views**
- ✅ **5%+ engagement rate**
- ✅ **18+ years old**
- ✅ **PayPal account connected**

Check eligibility:
```sql
select * from user_monetization 
where eligibility_status = 'eligible';
```

---

## 9. Ad Display Strategy (Maximum Profits)

### Placement Recommendations:

1. **Feed Top Banner**
   - Format: Responsive Display
   - Shows once per session
   - High visibility

2. **Feed Inline (Every 5 Posts)**
   - Format: Native In-Feed
   - Blends with content
   - High engagement

3. **Sidebar (Desktop)**
   - Format: Vertical Banner (300x600)
   - Persistent visibility
   - Desktop users only

4. **Profile Page**
   - Format: Horizontal Banner
   - Shows on every profile visit

5. **Explore Page**
   - Format: Native Grid
   - High traffic area

### Ad Frequency:
- **Mobile**: 1 ad per 3-5 posts
- **Desktop**: 1 ad per 5-7 posts + sidebar
- **Interstitial**: Every 10 actions (mobile app only)

---

## 10. Revenue Tracking

### View Your Earnings:
1. Go to **Admin Panel** → **Ad Configuration**
2. View total impressions and revenue per placement
3. Track 70% platform share

### View User Earnings:
```sql
select 
  up.username,
  um.total_earnings,
  um.pending_user_payout,
  um.pending_platform_payout,
  rs.platform_share,
  rs.user_share
from user_monetization um
join user_profiles up on up.id = um.user_id
join revenue_shares rs on rs.user_id = um.user_id
where um.is_monetized = true
order by um.total_earnings desc;
```

---

## 11. Testing Before Going Live

### AdSense Testing:
1. Use **AdSense Test Mode**
2. Enable test ads: Add `google_ad_client = "ca-google-adsense-test";`
3. Verify ads display correctly

### PayPal Testing:
1. Use **PayPal Sandbox**
2. Create test accounts
3. Test payout flow
4. Switch to live mode when ready

---

## 12. Legal & Compliance

### Required Pages:
- ✅ Privacy Policy (explain ad data collection)
- ✅ Terms of Service (explain revenue sharing)
- ✅ Ad Disclosure (explain 70/30 split to users)

### Tax Considerations:
- You (platform owner) must report 70% share as business income
- Users must report their 30% share (1099-K if >$600/year)
- Consult a tax professional

---

## 13. Optimization Tips

### Maximize Ad Revenue:
1. **Place ads strategically** (not too many, not too few)
2. **Use native ads** for better engagement
3. **A/B test placements** to find optimal positions
4. **Monitor CTR** (Click-Through Rate) in AdSense dashboard
5. **Responsive designs** for all screen sizes

### Common Mistakes to Avoid:
- ❌ Too many ads (users leave)
- ❌ Ads cover content (violates AdSense policy)
- ❌ Clicking own ads (banned from AdSense)
- ❌ Incentivizing ad clicks (banned from AdSense)

---

## 14. Support & Troubleshooting

### Common Issues:

**"Ads not showing"**
- Check AdSense approval status
- Verify ad code is correct
- Check browser ad blockers
- View page source to confirm ad script loaded

**"Revenue not splitting"**
- Check `distribute_ad_revenue()` function logs
- Verify user is monetized: `is_monetized = true`
- Check database triggers are active

**"PayPal payouts failing"**
- Verify PayPal account is verified
- Check email matches PayPal account
- Ensure sufficient balance
- Check PayPal API credentials (if automated)

### Get Help:
- AdSense: [AdSense Help Center](https://support.google.com/adsense)
- PayPal: [PayPal Developer Support](https://developer.paypal.com/support)
- Database: Check `query_backend_logs`

---

## 15. Next Steps

1. ✅ Set up AdSense account
2. ✅ Configure ad placements
3. ✅ Set platform PayPal email
4. ✅ Test ad display
5. ✅ Enable user monetization
6. ✅ Test withdrawal flow
7. ✅ Monitor revenue dashboard
8. ✅ Scale and optimize

---

## Summary

You now have a complete monetization system where:
- ✅ Users create content
- ✅ Ads display alongside content
- ✅ Revenue splits 70% to you, 30% to creator
- ✅ Automated tracking and payouts
- ✅ PayPal integration for withdrawals
- ✅ Verification payments via monetization earnings

**Your PayPal** (`nahashonnyaga794@gmail.com`) receives:
- 70% of all ad revenue
- 100% of verification fees
- Automated or manual payouts

Happy monetizing! 🚀💰
