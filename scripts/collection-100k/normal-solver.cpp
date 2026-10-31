// Independent exact-cover verification. No game-engine code or supplied answer
// is used in the search. Stop on the second solution, never call two unique.
#include <algorithm>
#include <iostream>
#include <stdexcept>
#include <vector>
#include <functional>
using namespace std;
using Mask=unsigned __int128;
int bits(Mask value){return __builtin_popcountll((unsigned long long)value)+__builtin_popcountll((unsigned long long)(value>>64));}

vector<Mask> reduce(int n,int br,int bc,const vector<int>& grid,const vector<vector<bool>>& row,const vector<vector<bool>>& col,const vector<vector<bool>>& box){
    vector<vector<int>> units(3*n);vector<vector<int>> member(n*n);vector<Mask> masks(n*n,0);
    for(int i=0;i<n*n;i++){
        int r=i/n,c=i%n,b=(r/br)*(n/bc)+c/bc;member[i]={r,n+c,2*n+b};
        for(int u:member[i])units[u].push_back(i);
        if(!grid[i])for(int v=0;v<n;v++)if(!row[r][v]&&!col[c][v]&&!box[b][v])masks[i]|=Mask(1)<<v;
    }
    auto cut=[&](int i,Mask remove){if(grid[i])return false;Mask before=masks[i];masks[i]&=~remove;if(!masks[i])throw runtime_error("no-candidates");return before!=masks[i];};
    while(true){
        bool changed=false;
        for(int i=0;i<n*n;i++)if(!grid[i]&&bits(masks[i])==1)for(int u:member[i])for(int j:units[u])if(i!=j)changed=cut(j,masks[i])||changed;
        for(int u=0;u<3*n;u++){
            Mask once=0,twice=0;
            for(int i:units[u]){twice|=once&masks[i];once|=masks[i];}
            Mask unique=once&~twice;
            for(int i:units[u])if(masks[i]&unique){Mask value=masks[i]&unique;if(bits(value)!=1)throw runtime_error("conflicting-hidden-single");changed=cut(i,~value)||changed;}
            for(int v=0;v<n;v++)if(once&(Mask(1)<<v)){
                int same[3]={-2,-2,-2};
                for(int i:units[u])if(masks[i]&(Mask(1)<<v))for(int d=0;d<3;d++){if(same[d]==-2)same[d]=member[i][d];else if(same[d]!=member[i][d])same[d]=-1;}
                for(int d=0;d<3;d++)if(same[d]>=0&&same[d]!=u)for(int j:units[same[d]])if(member[j][u/n]!=u)changed=cut(j,Mask(1)<<v)||changed;
            }
        }
        if(changed)continue;
        bool unresolved=false;for(int i=0;i<n*n;i++)if(!grid[i]&&bits(masks[i])>1){unresolved=true;break;}
        if(!unresolved)break;
        // Naked and hidden subsets remove candidates without choosing an answer.
        auto subset=[&](bool hidden,int width){
            for(const auto& unit:units){
                vector<Mask> values;vector<int> labels;
                if(!hidden){for(int i:unit)if(bits(masks[i])>=2&&bits(masks[i])<=width){labels.push_back(i);values.push_back(masks[i]);}}
                else for(int v=0;v<n;v++){Mask pos=0;for(int k=0;k<n;k++)if(masks[unit[k]]&(Mask(1)<<v))pos|=Mask(1)<<k;if(bits(pos)>=2&&bits(pos)<=width){labels.push_back(v);values.push_back(pos);}}
                vector<int> selected;
                function<bool(int,Mask)> visit=[&](int start,Mask merged){
                    if((int)selected.size()==width){
                        if(bits(merged)!=width)return false;bool did=false;
                        if(!hidden){for(int i:unit){bool chosen=false;for(int x:selected)if(labels[x]==i)chosen=true;if(!chosen)did=cut(i,merged)||did;}}
                        else{Mask digits=0;for(int x:selected)digits|=Mask(1)<<labels[x];for(int k=0;k<n;k++)if(merged&(Mask(1)<<k))did=cut(unit[k],~digits)||did;}
                        return did;
                    }
                    for(int x=start;x<(int)values.size();x++){Mask next=merged|values[x];if(bits(next)>width)continue;selected.push_back(x);if(visit(x+1,next))return true;selected.pop_back();}return false;
                };
                if(visit(0,0))return true;
            }
            return false;
        };
        for(int width=2;width<=4&&!changed;width++)changed=subset(false,width)||subset(true,width);
        // Fish patterns: k rows restrict a digit to k columns (or transposed).
        for(int transpose=0;transpose<2&&!changed;transpose++)for(int digit=0;digit<n&&!changed;digit++)for(int width=2;width<=4&&!changed;width++){
            vector<int> bases;vector<Mask> positions;Mask bit=Mask(1)<<digit;
            for(int u=0;u<n;u++){Mask pos=0;for(int v=0;v<n;v++){int i=transpose?v*n+u:u*n+v;if(masks[i]&bit)pos|=Mask(1)<<v;}if(bits(pos)>=2&&bits(pos)<=width){bases.push_back(u);positions.push_back(pos);}}
            vector<int> chosen;
            function<bool(int,Mask)> fish=[&](int start,Mask cover){
                if((int)chosen.size()==width){if(bits(cover)!=width)return false;bool did=false;for(int u=0;u<n;u++){bool selected=false;for(int x:chosen)if(bases[x]==u)selected=true;if(selected)continue;for(int v=0;v<n;v++)if(cover&(Mask(1)<<v))did=cut(transpose?v*n+u:u*n+v,bit)||did;}return did;}
                for(int x=start;x<(int)bases.size();x++){Mask next=cover|positions[x];if(bits(next)>width)continue;chosen.push_back(x);if(fish(x+1,next))return true;chosen.pop_back();}return false;
            };
            changed=fish(0,0);
        }
        if(changed)continue;
        // XY- and XYZ-wings. Only cells seeing all required endpoints lose Z.
        auto sees=[&](int a,int b){return member[a][0]==member[b][0]||member[a][1]==member[b][1]||member[a][2]==member[b][2];};
        for(int pivot=0;pivot<n*n&&!changed;pivot++)if(bits(masks[pivot])==2||bits(masks[pivot])==3){
            vector<int> ends;for(int u:member[pivot])for(int i:units[u])if(i!=pivot&&bits(masks[i])==2&&bits(masks[i]&masks[pivot])>0)ends.push_back(i);
            sort(ends.begin(),ends.end());ends.erase(unique(ends.begin(),ends.end()),ends.end());
            for(int a=0;a<(int)ends.size()&&!changed;a++)for(int b=a+1;b<(int)ends.size()&&!changed;b++){
                int x=ends[a],y=ends[b];Mask z=masks[x]&masks[y];if(bits(z)!=1||bits(masks[pivot]|masks[x]|masks[y])!=3)continue;
                if(bits(masks[pivot])==2){if(z&masks[pivot]||bits(masks[pivot]&masks[x])!=1||bits(masks[pivot]&masks[y])!=1)continue;}
                else if(!(z&masks[pivot])||(masks[x]&~masks[pivot])||(masks[y]&~masks[pivot]))continue;
                for(int u:member[x])for(int i:units[u])if(i!=pivot&&i!=x&&i!=y&&sees(i,y)&&(bits(masks[pivot])==2||sees(i,pivot)))changed=cut(i,z)||changed;
            }
        }
        if(!changed)break;
    }
    return masks;
}

struct Cover {
    struct Node {int l,r,u,d,col;};
    vector<Node> a;
    vector<int> size;
    long long visits=0;
    int solutions=0;
    explicit Cover(int columns):a(columns+1),size(columns+1,0){
        for(int i=0;i<=columns;i++)a[i]={i-1,i+1,i,i,i};
        a[0].l=columns;a[columns].r=0;
    }
    void row(const vector<int>& cols){
        int first=-1;
        for(int col:cols){
            int j=a.size();a.push_back({j,j,a[col].u,col,col});
            a[a[col].u].d=j;a[col].u=j;size[col]++;
            if(first<0)first=j;
            else{a[j].l=a[first].l;a[j].r=first;a[a[first].l].r=j;a[first].l=j;}
        }
    }
    void cover(int c){
        a[a[c].r].l=a[c].l;a[a[c].l].r=a[c].r;
        for(int i=a[c].d;i!=c;i=a[i].d)for(int j=a[i].r;j!=i;j=a[j].r){a[a[j].d].u=a[j].u;a[a[j].u].d=a[j].d;size[a[j].col]--;}
    }
    void uncover(int c){
        for(int i=a[c].u;i!=c;i=a[i].u)for(int j=a[i].l;j!=i;j=a[j].l){size[a[j].col]++;a[a[j].d].u=j;a[a[j].u].d=j;}
        a[a[c].r].l=c;a[a[c].l].r=c;
    }
    void search(){
        if(++visits>10000000)throw runtime_error("search-limit");
        if(a[0].r==0){solutions++;return;}
        int c=a[0].r;
        for(int j=a[c].r;j&&size[c]>1;j=a[j].r)if(size[j]<size[c])c=j;
        if(!size[c])return;
        cover(c);
        for(int r=a[c].d;r!=c&&solutions<2;r=a[r].d){
            for(int j=a[r].r;j!=r;j=a[j].r)cover(a[j].col);
            search();
            for(int j=a[r].l;j!=r;j=a[j].l)uncover(a[j].col);
        }
        uncover(c);
    }
};

int main(){
    ios::sync_with_stdio(false);cin.tie(nullptr);
    int n,br,bc;
    while(cin>>n>>br>>bc){
        if(n<1||n>100||br<1||bc<1||br*bc!=n||n%br||n%bc){cout<<"invalid-dimensions 0\n"<<flush;return 1;}
        vector<int> grid(n*n),answer(n*n);
        for(int& v:grid)if(!(cin>>v))return 2;
        for(int& v:answer)if(!(cin>>v))return 2;
        vector<vector<bool>> row(n,vector<bool>(n)),col=row,box=row;
        bool valid=true;
        for(int i=0;i<n*n;i++){
            int r=i/n,c=i%n,b=(r/br)*(n/bc)+c/bc,v=grid[i];
            if(v<0||v>n||answer[i]<1||answer[i]>n||(v&&v!=answer[i])){valid=false;break;}
            if(v){--v;if(row[r][v]||col[c][v]||box[b][v]){valid=false;break;}row[r][v]=col[c][v]=box[b][v]=true;}
        }
        for(int kind=0;valid&&kind<3;kind++)for(int unit=0;valid&&unit<n;unit++){
            vector<bool> seen(n,false);
            for(int offset=0;offset<n;offset++){
                int i=kind==0?unit*n+offset:kind==1?offset*n+unit:((unit/(n/bc))*br+offset/bc)*n+(unit%(n/bc))*bc+offset%bc;
                int v=answer[i]-1;if(seen[v]){valid=false;break;}seen[v]=true;
            }
        }
        if(!valid){cout<<"invalid-board 0\n"<<flush;continue;}
        vector<Mask> candidates;
        try{candidates=reduce(n,br,bc,grid,row,col,box);}
        catch(const exception& e){cout<<e.what()<<" 0\n"<<flush;continue;}
        bool keptAnswer=true;for(int i=0;i<n*n;i++)if(!grid[i]&&!(candidates[i]&(Mask(1)<<(answer[i]-1))))keptAnswer=false;
        if(!keptAnswer){cout<<"invalid-reduction 0\n"<<flush;continue;}
        vector<int> columns(4*n*n,-1);int count=0;
        for(int i=0;i<n*n;i++)if(!grid[i])columns[i]=++count;
        for(int u=0;u<n;u++)for(int v=0;v<n;v++){
            if(!row[u][v])columns[n*n+u*n+v]=++count;
            if(!col[u][v])columns[2*n*n+u*n+v]=++count;
            if(!box[u][v])columns[3*n*n+u*n+v]=++count;
        }
        Cover solver(count);
        for(int i=0;i<n*n;i++)if(!grid[i]){
            int r=i/n,c=i%n,b=(r/br)*(n/bc)+c/bc;
            for(int v=0;v<n;v++)if(candidates[i]&(Mask(1)<<v))solver.row({columns[i],columns[n*n+r*n+v],columns[2*n*n+c*n+v],columns[3*n*n+b*n+v]});
        }
        try{solver.search();cout<<solver.solutions<<' '<<solver.visits<<'\n'<<flush;}
        catch(const exception& e){cout<<e.what()<<' '<<solver.visits<<'\n'<<flush;}
    }
}
