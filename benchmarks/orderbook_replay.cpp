// Alpha Covariance — educational order-book update benchmark; not exchange matching or network latency.
// Input must be a user-authorised historical CSV: timestamp,side,price,quantity
// side in {B,A}, quantity 0 cancels the price level. Measures only a local map update+top lookup.
#include <algorithm>
#include <chrono>
#include <cmath>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <vector>
#include <cstdint>
struct Update{char side;double price,quantity;};
static bool parse(const std::string &line,Update &u){
  std::stringstream ss(line);std::string t,side,px,qty;
  if(!std::getline(ss,t,',')||!std::getline(ss,side,',')||!std::getline(ss,px,',')||!std::getline(ss,qty,','))return false;
  if(side!="B"&&side!="A")return false;
  try{u.side=side[0];u.price=std::stod(px);u.quantity=std::stod(qty);}catch(...){return false;}
  return std::isfinite(u.price)&&u.price>0&&std::isfinite(u.quantity)&&u.quantity>=0;
}
int main(int argc,char**argv){
  if(argc!=2){std::cerr<<"Usage: orderbook_replay <authorised-historical-book-updates.csv>\n";return 2;}
  std::ifstream f(argv[1]);if(!f){std::cerr<<"CSV not accessible\n";return 2;}
  std::string line;std::getline(f,line);
  if(line!="timestamp,side,price,quantity"){std::cerr<<"Unexpected CSV header\n";return 2;}
  std::vector<Update> updates;Update u;
  while(std::getline(f,line)){if(!parse(line,u)){std::cerr<<"Invalid update row\n";return 2;}updates.push_back(u);}
  if(updates.size()<100){std::cerr<<"At least 100 genuine historical events required\n";return 2;}
  std::map<double,double,std::greater<double>> bids;
  std::map<double,double,std::less<double>> asks;
  std::vector<std::int64_t> ns;ns.reserve(updates.size());
  volatile double sink=0;
  for(const auto &e:updates){
    auto t0=std::chrono::steady_clock::now();
    if(e.side=='B'){if(e.quantity==0)bids.erase(e.price);else bids[e.price]=e.quantity;}
    else{if(e.quantity==0)asks.erase(e.price);else asks[e.price]=e.quantity;}
    double bid=bids.empty()?0:bids.begin()->first;
    double ask=asks.empty()?0:asks.begin()->first;
    sink=sink+bid+ask;
    auto t1=std::chrono::steady_clock::now();
    ns.push_back(std::chrono::duration_cast<std::chrono::nanoseconds>(t1-t0).count());
  }
  std::sort(ns.begin(),ns.end());
  auto at=[&](double pct){return ns[std::min(ns.size()-1,size_t(pct*(ns.size()-1)))];};
  std::cout<<"LOCAL CPU ORDER-BOOK UPDATE BENCHMARK (NOT NETWORK LATENCY)\n"
    <<"events="<<updates.size()<<" p50_ns="<<at(.50)<<" p95_ns="<<at(.95)<<" p99_ns="<<at(.99)
    <<" measured=map_update_plus_best_level_lookup no_exchange_execution=true\n";
  (void)sink;return 0;
}
