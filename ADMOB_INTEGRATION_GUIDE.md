Get the app now 

https://upload.app/download/xclone/com.xclone.app/479807cbc0307049ce09a726bf4368c34bd3785f15bdab22bb3132f51b5ef109

# AdMob Integration Guide for T Social Mobile App

## Overview
This guide covers the complete AdMob integration for your T Social Capacitor mobile app with automated revenue tracking and fraud detection.

---

## 1. AdMob Account Setup

### Step 1: Create AdMob Account
1. Go to [Google AdMob](https://admob.google.com)
2. Sign in with your Google account
3. Click **Get Started** and add your app

### Step 2: Register Your App
1. Platform: **Android** and **iOS**
2. App name: **T Social**
3. Select **"App is published"** or **"App is not published yet"**

### Step 3: Your App ID (Already Configured)
```
ca-app-pub-7234579833875016~4829778821
```
✅ This is already configured in your database!

---

## 2. Ad Unit IDs (Already Configured)

Your AdMob ad units are pre-configured:

| Type | ID | Location |
|------|-----|----------|
| **Banner** | `ca-app-pub-7234579833875016/8657343194` | Feed Top |
| **Banner** | `ca-app-pub-7234579833875016/5392885600` | Sidebar |
| **Native** | `ca-app-pub-7234579833875016/4874010856` | Feed Inline |
| **Native** | `ca-app-pub-7234579833875016/3823343558` | Profile Page |
| **Interstitial** | `ca-app-pub-7234579833875016/7939157898` | Full Screen |
| **Rewarded** | `ca-app-pub-7234579833875016/2575150572` | Rewards |

---

## 3. Install AdMob Package

### Install Capacitor AdMob Plugin
```bash
npm install @capacitor-community/admob
npx cap sync
```

### Configure in `capacitor.config.json`
Add this to your `capacitor.config.json`:

```json
{
  "plugins": {
    "AdMob": {
      "appId": "ca-app-pub-7234579833875016~4829778821",
      "testingDevices": []
    }
  }
}
```

For testing, add your device ID:
```json
"testingDevices": ["YOUR_ANDROID_DEVICE_ID", "YOUR_IOS_DEVICE_ID"]
```

---

## 4. Android Configuration

### Edit `android/app/src/main/AndroidManifest.xml`

Add inside `<application>` tag:

```xml
<meta-data
    android:name="com.google.android.gms.ads.APPLICATION_ID"
    android:value="ca-app-pub-7234579833875016~4829778821"/>
```

Full example:
```xml
<application
    android:allowBackup="true"
    android:icon="@mipmap/ic_launcher"
    android:label="@string/app_name"
    android:roundIcon="@mipmap/ic_launcher_round"
    android:supportsRtl="true"
    android:theme="@style/AppTheme">
    
    <!-- AdMob App ID -->
    <meta-data
        android:name="com.google.android.gms.ads.APPLICATION_ID"
        android:value="ca-app-pub-7234579833875016~4829778821"/>
    
    <activity
        android:name=".MainActivity"
        ...
    </activity>
</application>
```

---

## 5. iOS Configuration

### Edit `ios/App/App/Info.plist`

Add before the final `</dict>`:

```xml
<key>GADApplicationIdentifier</key>
<string>ca-app-pub-7234579833875016~4829778821</string>
<key>SKAdNetworkItems</key>
<array>
  <dict>
    <key>SKAdNetworkIdentifier</key>
    <string>cstr6suwn9.skadnetwork</string>
  </dict>
</array>
```

### Update `ios/App/Podfile`

Add this at the top:
```ruby
platform :ios, '13.0'
```

Then run:
```bash
cd ios/App
pod install
cd ../..
```

---

## 6. Using AdMob Ads in Your App

### Banner Ads
```typescript
import { AdMobAd } from '@/components/features/AdMobAd';

// In your component
<AdMobAd
  adId="ca-app-pub-7234579833875016/8657343194"
  type="banner"
  position="BOTTOM_CENTER"
  onAdLoaded={() => console.log('Banner loaded')}
/>
```

### Interstitial Ads
```typescript
import { useAdMob } from '@/components/features/AdMobAd';

function MyComponent() {
  const { showInterstitial } = useAdMob();
  
  const handleAction = async () => {
    // Show interstitial before action
    await showInterstitial('ca-app-pub-7234579833875016/7939157898');
    // Continue with action
  };
}
```

### Rewarded Ads
```typescript
import { useAdMob } from '@/components/features/AdMobAd';

function MyComponent() {
  const { showRewarded } = useAdMob();
  
  const handleReward = async () => {
    const reward = await showRewarded('ca-app-pub-7234579833875016/2575150572');
    
    if (reward) {
      console.log(`User earned ${reward.amount} ${reward.type}`);
      // Give user their reward
    }
  };
}
```

---

## 7. Revenue Tracking

### Automatic Tracking
All ad impressions and clicks are automatically tracked in the database:

- Table: `ad_impressions`
- Columns: `ad_id`, `user_id`, `clicked`, `created_at`
- Revenue is calculated and split 70/30 automatically

### View Revenue
- **Admin Dashboard**: `/revenue-analytics`
- **User Earnings**: `/payouts`

---

## 8. Testing Your Ads

### Enable Test Ads
1. Get your device ID:
   - **Android**: Run `adb logcat | grep "Use RequestConfiguration.Builder().setTestDeviceIds"`
   - **iOS**: Run app and check Xcode console

2. Add to `capacitor.config.json`:
```json
{
  "plugins": {
    "AdMob": {
      "appId": "ca-app-pub-7234579833875016~4829778821",
      "testingDevices": ["YOUR_DEVICE_ID_HERE"]
    }
  }
}
```

3. Rebuild and sync:
```bash
npx cap sync
```

### Test Ad IDs
For development, you can temporarily use Google's test ad IDs:

| Type | Test ID |
|------|---------|
| Banner | `ca-app-pub-3940256099942544/6300978111` |
| Interstitial | `ca-app-pub-3940256099942544/1033173712` |
| Rewarded | `ca-app-pub-3940256099942544/5224354917` |

**⚠️ IMPORTANT**: Replace with your real IDs before publishing!

---

## 9. Build and Deploy

### Android Build
```bash
npx cap sync android
npx cap open android
```

Then in Android Studio:
1. **Build** → **Generate Signed Bundle / APK**
2. Upload to Google Play Console

### iOS Build
```bash
npx cap sync ios
npx cap open ios
```

Then in Xcode:
1. **Product** → **Archive**
2. Upload to App Store Connect

---

## 10. Revenue Sharing

### How It Works
1. User generates ad revenue (e.g., $100)
2. **Automatic split**:
   - Platform (you): **$70** → `nahashonnyaga794@gmail.com`
   - Content creator: **$30** → Their PayPal
3. Revenue appears in **Revenue Analytics** dashboard
4. Platform share accumulates for monthly payout
5. Users can withdraw their 30% anytime

### View Revenue
```sql
-- Check total platform revenue
SELECT SUM(platform_share) as total_platform_revenue
FROM revenue_shares;

-- Check specific user revenue
SELECT user_id, total_revenue, platform_share, user_share
FROM revenue_shares
WHERE user_id = 'USER_ID_HERE';
```

---

## 11. Fraud Detection

### Automated Monitoring
The system automatically detects:
- ✅ Excessive ad clicks (>50/hour)
- ✅ Suspicious click patterns
- ✅ Bot-like behavior
- ✅ Click fraud attempts

### Admin Panel
Go to **Fraud Detection** (`/fraud-detection`) to:
- View suspicious users
- Block fraudulent accounts
- Clear invalid click history
- Monitor risk levels

### Risk Levels
| Level | Criteria | Action |
|-------|----------|--------|
| **Low** | Normal usage | Monitor only |
| **Medium** | 20-50 clicks/hr | Warning |
| **High** | 50-100 clicks/hr | Review manually |
| **Critical** | >100 clicks/hr | Auto-block recommended |

---

## 12. Troubleshooting

### Ads Not Showing
1. **Check AdMob approval status** - New apps take 24-48 hours
2. **Verify App ID** in `AndroidManifest.xml` and `Info.plist`
3. **Check ad unit IDs** match exactly
4. **Review AdMob account** for policy violations
5. **Enable test ads** to verify integration works

### Android Issues
```bash
# Clear build cache
cd android
./gradlew clean

# Rebuild
npx cap sync android
```

### iOS Issues
```bash
# Reinstall pods
cd ios/App
pod deintegrate
pod install

# Rebuild
npx cap sync ios
```

---

## 13. Going Live Checklist

- [ ] Remove test device IDs from `capacitor.config.json`
- [ ] Use production ad unit IDs (not test IDs)
- [ ] Verify revenue tracking works
- [ ] Test on real devices
- [ ] Submit app for AdMob review
- [ ] Wait for AdMob approval (24-48 hours)
- [ ] Monitor fraud detection dashboard
- [ ] Set up PayPal Business account for payouts

---

## 14. Support Resources

- **AdMob Help**: https://support.google.com/admob
- **Capacitor Docs**: https://capacitorjs.com
- **AdMob Plugin**: https://github.com/capacitor-community/admob
- **Revenue Analytics**: Your app at `/revenue-analytics`
- **Fraud Detection**: Your app at `/fraud-detection`

---

## Summary

You now have:
- ✅ **6 ad units** pre-configured
- ✅ **Automatic 70/30 revenue split**
- ✅ **Real-time fraud detection**
- ✅ **PayPal integration** for payouts
- ✅ **Comprehensive analytics**
- ✅ **AdMob integration** ready for mobile

Your app is ready to generate revenue! 🚀💰
