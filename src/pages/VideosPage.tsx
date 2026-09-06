import * as React from 'react';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { VideoPlayer } from '@/components/features/VideoPlayer';
import { VideoAdSlide } from '@/components/features/VideoAdSlide';
import { supabase } from '@/lib/supabase';
import { Post } from '@/types/app-types';