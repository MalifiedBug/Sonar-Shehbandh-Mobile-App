// RevenueCat store subscription ("Pro") — Google Play / App Store billing on phones, Test Store in previews.
import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import Purchases, { LOG_LEVEL } from "react-native-purchases";
import type { CustomerInfo, PurchasesPackage } from "react-native-purchases";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { setStorePro } from "@/src/api";
import { useAuth } from "@/src/auth";

const REVENUECAT_TEST_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY;
const REVENUECAT_IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
const REVENUECAT_ANDROID_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;

export const REVENUECAT_ENTITLEMENT_IDENTIFIER = "pro";

// Phones always; web only in the dev preview (Test Store). Production web keeps Razorpay only.
export const rcEnabled = Platform.OS !== "web" || __DEV__;
// Dev builds, Expo Go and web preview use the simulated Test Store.
export const rcSimulated = Platform.OS === "web" || __DEV__;

function getRevenueCatApiKey() {
  if (!REVENUECAT_TEST_API_KEY || !REVENUECAT_IOS_API_KEY || !REVENUECAT_ANDROID_API_KEY) {
    throw new Error("RevenueCat public API keys not found");
  }
  if (rcSimulated) return REVENUECAT_TEST_API_KEY;
  if (Platform.OS === "ios") return REVENUECAT_IOS_API_KEY;
  return REVENUECAT_ANDROID_API_KEY;
}

export function initializeRevenueCat() {
  if (!rcEnabled) return;
  Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.WARN);
  Purchases.configure({ apiKey: getRevenueCatApiKey() });
}

function useSubscriptionContext() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const rcIdentityRef = useRef<string | null>(null);
  const [identityError, setIdentityError] = useState<string | null>(null);
  // Only read customer info once Purchases.logIn has bound this user (avoids an anonymous result overwriting it).
  const [boundId, setBoundId] = useState<string | null>(null);
  const bound = !!user?.id && boundId === user.id;

  const customerInfoQuery = useQuery({
    queryKey: ["revenuecat", "customer-info"],
    queryFn: () => Purchases.getCustomerInfo(),
    enabled: rcEnabled && bound,
    staleTime: 60 * 1000,
  });
  const offeringsQuery = useQuery({
    queryKey: ["revenuecat", "offerings"],
    queryFn: () => Purchases.getOfferings(),
    enabled: rcEnabled && !!user,
    staleTime: 300 * 1000,
  });

  // Bind purchases to our stable user id on every auth path; log out on sign-out.
  useEffect(() => {
    if (!rcEnabled) return;
    (async () => {
      try {
        if (user?.id && rcIdentityRef.current !== user.id) {
          const { customerInfo } = await Purchases.logIn(user.id);
          setIdentityError(null);
          await queryClient.cancelQueries({ queryKey: ["revenuecat", "customer-info"] });
          queryClient.setQueryData(["revenuecat", "customer-info"], customerInfo);
          setBoundId(user.id);
          rcIdentityRef.current = user.id; // set only after success, so a failed logIn is retried on the next login
        } else if (!user?.id && rcIdentityRef.current) {
          await Purchases.logOut();
          rcIdentityRef.current = null;
          setBoundId(null);
          queryClient.removeQueries({ queryKey: ["revenuecat"] });
        }
      } catch (e: any) {
        setIdentityError(e?.message ?? String(e));
      }
    })();
  }, [user?.id, queryClient]);

  // Reactive entitlement updates (purchases, restores, renewals) — never polled.
  useEffect(() => {
    if (!rcEnabled) return;
    const listener = (info: CustomerInfo) => queryClient.setQueryData(["revenuecat", "customer-info"], info);
    Purchases.addCustomerInfoUpdateListener(listener);
    return () => {
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, [queryClient]);

  const purchaseMutation = useMutation({
    mutationFn: async (pkg: PurchasesPackage) => {
      // Never let an anonymous purchase through: the current app user id must be our user id.
      if ((await Purchases.isAnonymous()) || (await Purchases.getAppUserID()) !== user?.id) throw new Error("identity_not_ready");
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      return customerInfo;
    },
    // Web (browser mode) does not always fire the update listener, so store the result directly.
    onSuccess: (ci) => queryClient.setQueryData(["revenuecat", "customer-info"], ci),
  });
  const restoreMutation = useMutation({
    mutationFn: () => Purchases.restorePurchases(),
    onSuccess: (ci) => queryClient.setQueryData(["revenuecat", "customer-info"], ci),
  });

  const info = bound ? customerInfoQuery.data : undefined;
  const isSubscribed = info?.entitlements.active?.[REVENUECAT_ENTITLEMENT_IDENTIFIER] !== undefined;
  // Ready once Purchases.logIn(user.id) succeeded (originalAppUserId can stay an old anonymous id after aliasing).
  const identityReady = bound;

  // Tell the API layer so paid details are sent to this phone.
  useEffect(() => {
    setStorePro(isSubscribed);
  }, [isSubscribed]);

  return {
    customerInfo: info,
    offerings: offeringsQuery.data,
    offeringsError: offeringsQuery.error as Error | null,
    isSubscribed,
    identityReady,
    identityError,
    isLoading: !bound || customerInfoQuery.isLoading || offeringsQuery.isLoading,
    purchase: purchaseMutation.mutateAsync,
    restore: restoreMutation.mutateAsync,
    isPurchasing: purchaseMutation.isPending,
    isRestoring: restoreMutation.isPending,
  };
}

type Ctx = ReturnType<typeof useSubscriptionContext>;
const Context = createContext<Ctx | null>(null);

function EnabledProvider({ children }: { children: React.ReactNode }) {
  const value = useSubscriptionContext();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  if (!rcEnabled) return <>{children}</>;
  return <EnabledProvider>{children}</EnabledProvider>;
}

// Returns null when store billing isn't available (production web).
export function useSubscription() {
  return useContext(Context);
}
